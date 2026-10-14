export type CdpTransport = {
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<Record<string, unknown>>;
  on(method: string, handler: (params: Record<string, unknown>, sessionId?: string) => void): () => void;
};
export type DefaultContext = { session: string; frame: string; id: number; unique?: string; origin: string };
export type ShellAuthority = { context: DefaultContext; revision: number };
type FrameTree = { frame?: { id?: string; loaderId?: string }; childFrames?: FrameTree[] };

/** Numeric IDs are session-local; frame ownership, not URL/name, selects worlds. */
export class ArtifactContexts {
  shellFrame: string | null = null;
  artifactFrame: string | null = null;
  private contexts = new Map<string, DefaultContext>();
  private childSessions = new Map<string, string>();
  private loaders = new Map<string,string>();
  private loaderVersions = new Map<string,number>();
  private sameDocumentVersions = new Map<string,number>();
  private discovering: Promise<void> | null = null;
  private active = true;
  private shellRevision = 0;
  private shellUrl = '';
  private trustedShellUrl: string;
  private trustedShellOrigin: string;
  private cdp: CdpTransport;
  readonly shellSession: string;
  private scripts: string;
  private changed: () => void;
  constructor(cdp: CdpTransport, shellSession: string, scripts: string, changed: () => void, trustedShellUrl: string) {
    this.cdp=cdp;this.shellSession=shellSession;this.scripts=scripts;this.changed=changed;
    this.trustedShellUrl=new URL(trustedShellUrl).href;this.trustedShellOrigin=new URL(trustedShellUrl).origin;
    cdp.on('Runtime.executionContextCreated', (params, session) => {
      const context = params.context as { id?: number; uniqueId?: string; origin?: string; auxData?: { isDefault?: boolean; frameId?: string } } | undefined;
      if (!session || !context?.auxData?.isDefault || !context.auxData.frameId || typeof context.id !== 'number') return;
      if(session===shellSession&&context.auxData.frameId===this.shellFrame)this.shellRevision++;
      this.contexts.set(session + ':' + context.id, { session, frame: context.auxData.frameId, id: context.id, unique: context.uniqueId, origin:context.origin??'' });
      void this.discover().then(() => this.initializeArtifact()).catch(() => undefined);
    });
    cdp.on('Runtime.executionContextDestroyed', (params, session) => {
      if(this.contexts.get(session+':'+params.executionContextId)?.frame===this.shellFrame)this.shellRevision++;
      this.contexts.delete(session + ':' + params.executionContextId); this.changed();
    });
    cdp.on('Runtime.executionContextsCleared', (_params, session) => {
      if(session===shellSession)this.shellRevision++;
      for (const [key, context] of this.contexts) if (context.session === session) this.contexts.delete(key);
      this.changed();
    });
    cdp.on('Page.frameNavigated', (params, session) => {
      const frame=params.frame as {id?:string;parentId?:string;url?:string;loaderId?:string}|undefined;
      if(session===shellSession&&frame&&!frame.parentId){
        this.shellRevision++;this.shellUrl='';this.artifactFrame=null;
      }
      if (session === shellSession || this.childSessions.has(session ?? '')) {
        if(frame?.id&&frame.loaderId){
          this.loaders.set(frame.id,frame.loaderId);
          this.loaderVersions.set(frame.id,(this.loaderVersions.get(frame.id)??0)+1);
        }
        void this.discover().then(() => this.initializeArtifact()).catch(() => undefined); this.changed();
      }
    });
    cdp.on('Page.navigatedWithinDocument',(params,session)=>{
      if((session===shellSession||this.childSessions.has(session??''))&&typeof params.frameId==='string'){
        this.sameDocumentVersions.set(params.frameId,(this.sameDocumentVersions.get(params.frameId)??0)+1);this.changed();
      }
    });
    cdp.on('Page.frameAttached', () => { void this.discover().then(() => this.initializeArtifact()).catch(() => undefined); });
    cdp.on('Page.frameDetached', (params) => {
      if(params.frameId===this.shellFrame){this.shellRevision++;this.shellUrl='';this.artifactFrame=null;}
      if (params.frameId === this.artifactFrame && params.reason !== 'swap') this.artifactFrame = null;
      this.changed();
    });
    cdp.on('Target.attachedToTarget', (params) => {
      const info = params.targetInfo as { type?: string; targetId?: string } | undefined;
      if (info?.type !== 'iframe' || typeof params.sessionId !== 'string') return;
      this.childSessions.set(params.sessionId, info.targetId ?? '');
      void this.enable(params.sessionId).then(() => this.discover()).then(() => this.initializeArtifact()).catch(() => undefined);
    });
    cdp.on('Target.detachedFromTarget', (params) => {
      if(params.sessionId===shellSession){this.shellRevision++;this.shellUrl='';this.artifactFrame=null;}
      this.childSessions.delete(String(params.sessionId));
      for (const [key, context] of this.contexts) if (context.session === params.sessionId) this.contexts.delete(key);
      this.changed();
    });
  }
  async enable(session: string): Promise<void> {
    await this.cdp.send('Page.enable', {}, session);
    // Bindings must exist before any new-document script calls them.
    for (const name of ['__dsPick', '__dsArtifactEvent', '__dsCanvasSend', '__dsShellState']) await this.cdp.send('Runtime.addBinding', { name }, session);
    await this.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: this.scripts }, session);
    await this.cdp.send('Runtime.enable', {}, session);
    await this.cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, session);
  }
  async discover(): Promise<void> {
    if (!this.active) return;
    if (this.discovering) return this.discovering;
    this.discovering = (async () => {
      const revision=this.shellRevision;
      const result = await this.cdp.send('Page.getFrameTree', {}, this.shellSession);
      const tree = result.frameTree as { frame?: { id?: string; url?: string }; childFrames?: Array<{ frame?: { id?: string } }> } | undefined;
      if (!tree?.frame?.id) return;
      if(!this.active||revision!==this.shellRevision)return;
      this.shellUrl=tree.frame.url??'';
      if(this.shellUrl!==this.trustedShellUrl||(this.shellFrame!==null&&this.shellFrame!==tree.frame.id)){this.shellUrl='';this.artifactFrame=null;return;}
      this.shellFrame = tree.frame.id;
      const candidates = new Set((tree.childFrames ?? []).map((child) => child.frame?.id).filter((id): id is string => !!id));
      // An OOPIF can be absent from getFrameTree until its session is enabled.
      for (const frame of this.childSessions.values()) if (frame) candidates.add(frame);
      for (const frame of candidates) {
        try {
          const owner = await this.cdp.send('DOM.getFrameOwner', { frameId: frame }, this.shellSession);
          const result = await this.cdp.send('DOM.describeNode', { backendNodeId: owner.backendNodeId }, this.shellSession);
          const node = result.node as { attributes?: string[]; nodeName?: string } | undefined;
          const attrs = node?.attributes ?? [];
          if (node?.nodeName === 'IFRAME' && attrs.some((value, index) => index % 2 === 0 && value === 'id' && attrs[index + 1] === 'preview')) {
            if(this.active&&revision===this.shellRevision)this.artifactFrame = frame; return;
          }
        } catch { /* nested/sibling targets have no owner in the shell */ }
      }
    })().finally(() => { this.discovering = null; });
    return this.discovering;
  }
  shell(): DefaultContext | null {
    if(!this.active||this.discovering||this.shellUrl!==this.trustedShellUrl)return null;
    const context=this.find(this.shellSession,this.shellFrame);
    return context?.origin===this.trustedShellOrigin?context:null;
  }
  captureShellAuthority(session:string|undefined,id:unknown):ShellAuthority|null{
    const context=this.shell();return this.matches(context,session,id)?{context:context!,revision:this.shellRevision}:null;
  }
  shellAuthorityCurrent(authority:ShellAuthority):boolean{
    return this.active&&authority.revision===this.shellRevision&&this.shell()===authority.context;
  }
  artifact(): DefaultContext | null {
    if (!this.artifactFrame) return null;
    return [...this.contexts.values()].find((context) => context.frame === this.artifactFrame &&
      (context.session === this.shellSession || this.childSessions.get(context.session) === this.artifactFrame)) ?? null;
  }
  artifactLoaderId():string|null{return this.artifactFrame?this.loaders.get(this.artifactFrame)??null:null;}
  artifactSameDocumentVersion():number{return this.artifactFrame?this.sameDocumentVersions.get(this.artifactFrame)??0:0;}
  private find(session: string, frame: string | null): DefaultContext | null {
    return [...this.contexts.values()].find((context) => context.session === session && context.frame === frame) ?? null;
  }
  matches(context: DefaultContext | null, session: string | undefined, id: unknown): boolean {
    return this.active && !!context && context.session === session && context.id === id && this.contexts.get(session + ':' + id)===context;
  }
  async evaluate(context: DefaultContext, expression: string, awaitPromise = false): Promise<unknown> {
    if(!this.matches(context,context.session,context.id))throw new Error('execution context authority was revoked');
    const result = await this.cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise,
      ...(context.unique ? { uniqueContextId: context.unique } : { contextId: context.id }) }, context.session);
    if (result.exceptionDetails) throw new Error('artifact evaluation failed: ' + JSON.stringify(result.exceptionDetails));
    return (result.result as { value?: unknown } | undefined)?.value;
  }
  async initializeArtifact(): Promise<void> {
    const context = this.artifact();
    if (context && this.active) {
      await this.seedArtifactLoader(context);
      if(this.artifact()===context)await this.evaluate(context, 'window.__dsTrustedArtifact=true;'+this.scripts);
    }
    this.changed();
  }
  /** A new OOPIF may commit before Page.enable can report frameNavigated. */
  private async seedArtifactLoader(context:DefaultContext):Promise<void>{
    const revision=this.shellRevision,version=this.loaderVersions.get(context.frame)??0;
    const result=await this.cdp.send('Page.getFrameTree',{},context.session);
    if(!this.active||revision!==this.shellRevision||this.shellUrl!==this.trustedShellUrl||
      this.artifactFrame!==context.frame||this.artifact()!==context||
      !this.matches(context,context.session,context.id)||
      version!==(this.loaderVersions.get(context.frame)??0))return;
    const tree=result.frameTree as FrameTree|undefined;
    let frame:FrameTree['frame'];
    if(context.session===this.shellSession){
      if(tree?.frame?.id!==this.shellFrame)return;
      const find=(node:FrameTree|undefined):FrameTree['frame']=>{
        if(node?.frame?.id===context.frame)return node.frame;
        for(const child of node?.childFrames??[]){const found=find(child);if(found)return found;}
        return undefined;
      };
      frame=find(tree);
    }else{
      // The child session must own this exact frame as its root, not a nested
      // same-URL/name descendant or another attached target.
      if(this.childSessions.get(context.session)!==context.frame||tree?.frame?.id!==context.frame)return;
      frame=tree.frame;
    }
    if(typeof frame?.loaderId==='string'&&frame.loaderId)this.loaders.set(context.frame,frame.loaderId);
  }
  close(): void { this.active = false; this.shellRevision++;this.shellUrl='';this.contexts.clear(); this.childSessions.clear(); }
}
