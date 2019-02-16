import * as vscode from 'vscode';

import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';

import * as getPort from 'get-port';

export default class WASMWebServer
{
    private context: vscode.ExtensionContext;

    private server: any | undefined;

    private port: number = 7263;

    private portPromise: PromiseLike<void>;

    public getPort(): Promise<number>
    {
        return new Promise<number>((resolve) =>
        {
            this.portPromise.then(() => {
                resolve(this.port);
            });
        });
    }

    constructor(context: vscode.ExtensionContext)
    {
        this.context = context;

        this.portPromise = getPort().then((port: number) =>
        {
            this.port = port;

            var app = express();

            app.get('/wasm/:file', (req: any, res: any) =>
            {
                res.header("Access-Control-Allow-Origin", "*");
                res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

                let filepath = this.context.asAbsolutePath(path.join('media/wasm', req.params.file));

                fs.readFile(filepath, (err:any, data:any) =>
                {
                    if(err)
                    {
                        res.send("Oops! Couldn't find that file.");
                    } else
                    {
                        let mime = 'application/octet-steam';

                        let ext = (req.params.file.split('.') || ['']).pop();
                        switch(ext)
                        {
                            case 'js':
                                mime = "text/javascript";
                                break;
                            case 'wasm':
                                mime = "application/wasm";
                                break;
                        }

                        res.contentType(mime);
                        res.send(data);
                    }
                    res.end();
                });
            });

            this.server = app.listen(this.port);
        });

    }

    dispose()
    {
        if (this.server && this.server.close)
        {
            this.server.close();
        }
    }

}
