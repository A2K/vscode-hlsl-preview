'use strict';

import * as cp from 'child_process';
import * as vscode from 'vscode';

import ShaderDocument from './ShaderDocument';
import GLSLCode from './GLSLCode';


export default class GLSLCompiler
{
    private defaultArgs: string[] = [ '--version', '2.0', '--es' ];

    private executable: string = "SPIRV-Cross.exe";

    constructor()
    {
        this.loadConfiguration();
    }

    public loadConfiguration()
    {
        let section = vscode.workspace.getConfiguration('hlsl');

        if (section)
        {
            this.executable = section.get<string>('preview.spirv.executablePath', this.executable);
            this.defaultArgs = section.get<string[]>('preview.spirv.defaultArgs', this.defaultArgs);
        }
    }

    public canUseNativeBinary(): Promise<boolean>
    {
        return new Promise<boolean>((resolve) =>
        {
            let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;
            let childProcess = cp.spawn(this.executable, [ '--help' ], options);

            childProcess.on('error', (error: Error) =>
            {
                console.error(`SPIRV[${this.executable}] failed: ${error}`);
                resolve(false);
            });

            childProcess.on('exit', (code: number, signal: string) =>
            {
                if (code !== 0)
                {
                    console.error(`SPIRV[${this.executable}] exited with non-zero code: ${code}`);
                }
                resolve(code === 0);
            });
        });
    }

    public Compile(filename: string, reflect: boolean = false): Promise<string>
    {
        return new Promise<string>((resolve, reject) =>
        {
            let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;

            let args: string[] = reflect ? [ '--reflect' ].concat(Array.from(this.defaultArgs)) : Array.from(this.defaultArgs);

            args.push(filename);

            //console.log(`Starting "${this.executable} ${args.join(' ')}"`);

            let childProcess = cp.spawn(this.executable, args, options);

            childProcess.on('error', (error: Error) =>
            {
                console.error('childProcess error:', error);
                reject(error);
            });

            if (!childProcess.pid)
            {
                let errorMessage = "no child process pid (failed to create process)";
                console.error(errorMessage);
                reject(errorMessage);
                return;
            }

            var CompleteData: string = "";

            childProcess.stdout.on('data', (data: Buffer) =>
            {
                CompleteData += data.toString();
            });

            var err: string = "";
            childProcess.stderr.on('data', (data: Buffer) =>
            {
                err += data.toString();
            });

            childProcess.on('exit', (code) =>
            {
                if (code === 0)
                {
                    resolve(CompleteData);
                }
                else
                {
                    reject(err);
                }
            });
        });
    }

    public Process(shaderDocument: ShaderDocument, filename: string): Promise<GLSLCode>
    {
        return new Promise<GLSLCode>((resolve, reject) =>
        {
            this.Compile(filename, false)
            .then(
                (code: string) =>
                {
                    this.Compile(filename, true)
                    .then(
                        (reflectionData: string) =>
                        {
                            resolve(new GLSLCode(shaderDocument, code, JSON.parse(reflectionData)));
                        }
                    )
                    .catch(reason => reject(reason));
                }
            )
            .catch(reason => reject(reason));
        });
    }

}
