
export interface ITask<T> {
    (): T;
}

export class Throttler<T> {

    private activePromise: Promise<T> | null;
    private queuedPromise: Promise<T> | null;
    private queuedPromiseFactory: ITask<Promise<T>> | null;

    constructor() {
        this.activePromise = null;
        this.queuedPromise = null;
        this.queuedPromiseFactory = null;
    }

    public queue(promiseFactory: ITask<Promise<T>>): Promise<T> {
        if (this.activePromise) {
            this.queuedPromiseFactory = promiseFactory;

            if (!this.queuedPromise) {
                var onComplete = () => {
                    this.queuedPromise = null;

                    if (!this.queuedPromiseFactory) {
                        return new Promise<T>((resolve, reject) => {
                            resolve();
                        });
                    }

                    var result = this.queue(this.queuedPromiseFactory);
                    this.queuedPromiseFactory = null;

                    return result;
                };

                this.queuedPromise = new Promise<T>((resolve, reject) => {
                    if (this.activePromise) {
                        this.activePromise.then(onComplete, onComplete).then(resolve);
                    }
                });
            }

            return new Promise<T>((resolve, reject) => {
                if (this.queuedPromise) {
                    this.queuedPromise.then(resolve, reject);
                }
            });
        }

        this.activePromise = promiseFactory();

        return new Promise<T>((resolve, reject) => {
            if (this.activePromise) {
                this.activePromise.then((result: T) => {
                    this.activePromise = null;
                    resolve(result);
                }, (err: any) => {
                    this.activePromise = null;
                    reject(err);
                });
            }
        });
    }
}

export class Delayer<T>
{
    public defaultDelay: number;
    private timeout: NodeJS.Timer | null;
    private completionPromise: Promise<T> | null;
    private onResolve: ((value: T | Thenable<T> | undefined) => void) | null;
    private task: ITask<T> | null;

    constructor(defaultDelay: number)
    {
        this.defaultDelay = defaultDelay;
        this.timeout = null;
        this.completionPromise = null;
        this.onResolve = null;
        this.task = null;
    }

    public trigger(task: ITask<T>, delay: number = this.defaultDelay): Promise<T>
    {
        this.task = task;
        this.cancelTimeout();

        if (!this.completionPromise)
        {
            this.completionPromise = new Promise<T>((resolve, reject) =>
            {
                this.onResolve = resolve;
            }).then(() =>
            {
                this.completionPromise = null;
                this.onResolve = null;

                if (this.task === null) {
                    return new Promise<T>((resolve, reject) => {
                        resolve();
                    });
                }
                var result = this.task();
                this.task = null;

                return result;
            });
        }

        this.timeout = setTimeout(() =>
        {
            this.timeout = null;
            if (this.onResolve) {
                this.onResolve(undefined);
            }
        }, delay);

        return this.completionPromise;
    }

    public isTriggered(): boolean
    {
        return this.timeout !== null;
    }

    public cancel(): void
    {
        this.cancelTimeout();

        if (this.completionPromise)
        {
            this.completionPromise = null;
        }
    }

    private cancelTimeout(): void
    {
        if (this.timeout !== null)
        {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    }
}

/**
 * A helper to delay execution of a task that is being requested often, while
 * preventing accumulation of consecutive executions, while the task runs.
 *
 * Simply combine the two mail man strategies from the Throttler and Delayer
 * helpers, for an analogy.
 */
export default class ThrottledDelayer<T> extends Delayer<Promise<T>>
{
    private throttler: Throttler<T>;

    constructor(defaultDelay: number)
    {
        super(defaultDelay);

        this.throttler = new Throttler();
    }

    public trigger(promiseFactory: ITask<Promise<T>>, delay?: number): Promise<Promise<T>>
    {
        return super.trigger(() => this.throttler.queue(promiseFactory), delay);
    }
}
