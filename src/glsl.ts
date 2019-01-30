'use strict';

import * as cp from 'child_process';
import * as vscode from 'vscode';

export class GLSLCode {

    public code: string;
    public reflection: { [key:string]: any };

    constructor(code: string, reflection: object)
    {
        this.code = code;
        this.reflection = reflection;
    }
}

export default class GLSLCompiler {
    
    private defaultArgs: string[] = [ '--version', '2.0', '--es' ];

    private executable: string = "D:\\Desktop\\SPIRV-Cross-2019-01-17\\msvc\\Debug\\SPIRV-Cross.exe";

    constructor() {

    }

    public Compile(filename: string, reflect: boolean = false): Promise<string>
    {        
        return new Promise<string>((resolve, reject) => {
            let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;

            let args: string[] = reflect ? [ '--reflect' ].concat(Array.from(this.defaultArgs)) : Array.from(this.defaultArgs);

            args.push(filename);

            //console.log(`Starting "${this.executable} ${args.join(' ')}"`);

            let childProcess = cp.spawn(this.executable, args, options);

            childProcess.on('error', (error: Error) => {
                console.error('childProcess error:', error);
                reject(error);
            });
            
            if (!childProcess.pid) {
                console.error('!childProcess.pid');
                reject("no child process pid");
                return;
            }

            var CompleteData: string = "";

            childProcess.stdout.on('data', (data: Buffer) => {
                CompleteData += data.toString();
            });
            
            var err: string = "";
            childProcess.stderr.on('data', (data: Buffer) => {
                err += data.toString();
            });
            childProcess.stderr.on('end', (data: Buffer) => {
                //console.log('error: ' + err);
            });

            childProcess.on('exit', (code) => {
                if (code === 0) {
                    if (!reflect) {
                        CompleteData = CompleteData.replace('gl_FragData[0]', 'gl_FragColor').replace(/^#version.*$/gm, '');
                    }
                    resolve(CompleteData);
                } else {
                    reject(err);
                }
            });
        });
    }

    public Process(filename: string): Promise<GLSLCode> 
    {
        return new Promise<GLSLCode>((resolve, reject) => {
            this.Compile(filename, false)
            .then((code: string) => {
                this.Compile(filename, true)
                .then((reflectionData: string) => {
                    //console.log('reflectionData', reflectionData);
                    resolve(new GLSLCode(code, JSON.parse(reflectionData)));
                })
                .catch(reason => reject(reason));
            })
            .catch(reason => reject(reason));
        });
    }
    
}
