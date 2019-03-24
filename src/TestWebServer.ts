import * as vscode from 'vscode';

import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';

import { GetWebviewContent } from './WebViewContent';


export default class WASMWebServer
{
    private context: vscode.ExtensionContext;

    private server: any | undefined;
    private app: any;

    private useNativeBinaries: boolean = false;

    private port: number = 8080;

    constructor(context: vscode.ExtensionContext, port: number = 8080)
    {
        this.context = context;

        this.port = port;

        this.loadConfiguration();

        this.createApp();
    }

    private createApp()
    {
        this.app = express();

        this.app.get('/wasm/:file', this.handleRequest.bind(this));

        this.app.get('/', this.serveIndexHTML.bind(this));

        this.app.get('/testWorker', this.serverTestWorkerIndexHTML.bind(this));

        this.server = this.app.listen(this.port);
    }

    public loadConfiguration()
    {
        let section = vscode.workspace.getConfiguration('hlsl');

        if (section)
        {
            this.useNativeBinaries = section.get<boolean>('preview.useNativeBinaries', true);
        }
    }

    private serveIndexHTML(req: any, res: any)
    {
        let HTML = GetWebviewContent(this.context, this.useNativeBinaries, false, 0);
        req.send(HTML);
    }

    private serverTestWorkerIndexHTML(req: any, res: any)
    {

    }

    private handleRequest(req: any, res: any)
    {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers",
                   "Origin, X-Requested-With, Content-Type, Accept");

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
    }

    dispose()
    {
        if (this.server && this.server.close)
        {
            this.server.close();
        }
    }

}
