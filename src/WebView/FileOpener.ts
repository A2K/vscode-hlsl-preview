
export class FileOpener
{
    private pendingOps: { [key:number]: {
        resolve: any,
        reject: any,
        time: number
    }};

    private lastFileOpId: number = 0;

    private postMessage: (type: string, data: any) => void;

    constructor(postMessage: (type: string, data: any) => void)
    {
        this.postMessage = postMessage;

        this.pendingOps = {};
    }

    private getNextOpId(): number
    {
        return this.lastFileOpId++;
    }

    private createOp(resolve: any, reject: any): number
    {
        let time = new Date().getTime();
        let opId = this.getNextOpId();
        this.pendingOps[opId] = {
            resolve: resolve,
            reject: reject,
            time: time
        };
        return opId;
    }

    public open(): Promise<{ [key:string]: any }>
    {
        return new Promise<{ [key:string]: any }>((
            (
                resolve: (data?: { [key:string]: any } | PromiseLike<{ [key:string]: any }> | undefined) => void,
                 reject: (reason?: any) => void
            ) =>
            {
                this.postMessage('openFile', {
                    opId: this.createOp(resolve, reject)
                });
            }).bind(this));
    }

    public load(filename: string): Promise<{ [key:string]: any }>
    {
        return new Promise<{ [key:string]: any }>((
            (
                resolve: (data?: { [key:string]: any } | PromiseLike<{ [key:string]: any }> | undefined) => void,
                 reject: (reason?: any) => void
            ) =>
            {
                this.postMessage('loadFile', {
                    opId: this.createOp(resolve, reject),
                    filename: filename
                });
            }).bind(this));
    }

    public onFileResult(data: { [key:string]: any }): void
    {
        let opId:number = parseInt(data['opId']);

        if (!(opId in this.pendingOps))
        {
            console.error('onOpenFile got unexpected opId:', opId);
            return;
        }

        let resolve = this.pendingOps[opId].resolve;

        delete this.pendingOps[opId];

        resolve(data);

    }
}

