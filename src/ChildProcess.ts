import * as cp from 'child_process';

export default class ChildProcess
{
    public executable: string;
    public args: string[];
    public options: cp.SpawnOptions | undefined;
    public exitCode: number | undefined;

    public buffers = {
        stdout: '',
        stderr: ''
    };

    private promise: {
        resolve: ((code: number) => void) | undefined,
        reject: ((reason: any) => void) | undefined
    } = {
        resolve: undefined,
        reject: undefined
    };

    constructor(executable: string, args: string[], options: cp.SpawnOptions | undefined)
    {
        this.executable = executable;
        this.args = args;
        this.options = options;
    }

    public async Run()
    {
        let promise = new Promise<number>((resolve, reject) => {
            this.promise.resolve = resolve;
            this.promise.reject = reject;
        });

        let childProcess = cp.spawn(this.executable, this.args, this.options);

        childProcess.on('error', this.onError);

        if (!childProcess.pid)
        {
            throw new Error("No child process pid (failed to create process)");
        }

        childProcess.stdout.on('data', (buf: Buffer) => this.buffers.stdout += buf.toString());
        childProcess.stderr.on('data', (buf: Buffer) => this.buffers.stderr += buf.toString());

        childProcess.on('exit', this.onExit.bind(this));

        return promise;
    }

    onError(error: Error)
    {
        if (this.promise.reject)
        {
            this.promise.reject(error);
            delete this.promise.resolve;
            delete this.promise.reject;
        }
    }

    onExit(code: number)
    {
        this.exitCode = code;
        if (this.promise.resolve)
        {
            this.promise.resolve(code);
            delete this.promise.resolve;
            delete this.promise.reject;
        }
    }

    static async Execute(executable: string, args: string[], options: cp.SpawnOptions | undefined)
    {
        let process = new ChildProcess(executable, args, options);
        await process.Run();
        return process;
    }
}