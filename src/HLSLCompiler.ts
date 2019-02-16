'use strict';

import * as vscode from 'vscode';

import * as fs from 'fs';
import * as cp from 'child_process';
import * as tempfile from 'tempfile';

import ShaderDocument from './ShaderDocument';

import { ShaderType } from './Enums';


export default class HLSLCompiler
{

    private executable: string = "dxc";

    private executableNotFound: boolean = false;

    private includeDirs: string[] = [];

    private defaultArgs: string[] = [ "-Od", "-Ges", "-spirv", "-fspv-reflect", "-fspv-target-env=vulkan1.1" ];

    constructor()
    {
        this.loadConfiguration();
    }

    public canUseNativeBinary(): Promise<boolean>
    {
        return new Promise<boolean>((resolve) =>
        {
            let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;
            let childProcess = cp.spawn(this.executable, [ '-help' ], options);

            childProcess.on('error', (error: Error) =>
            {
                console.error(`DXC[${this.executable}] failed: ${error}`);
                resolve(false);
            });

            childProcess.on('exit', (code: number, signal: string) =>
            {
                if (code !== 0)
                {
                    console.error(`DXC[${this.executable}] exited with non-zero code: ${code}`);
                }
                resolve(code === 0);
            });
        });
    }

    public static ProcessErrorMessage(filename: string, tmpFilename: string, message: string, metadata: {
        text: string,
        symbols: string[],
        predefined: { [key: string]: string },
        addedLines: number
    }): string
    {
        if (!message)
        {
            return "";
        }

        return message.split(/\n/g).map(line =>
        {
            if (line.toLowerCase().startsWith(tmpFilename.toLowerCase()))
            {
                let errorMessage = line.substr(tmpFilename.length);
                let parts = errorMessage.split(':');
                parts[1] = (parseInt(parts[1]) - metadata.addedLines).toString();
                return filename + parts.join(':');
            }
            return line;
        }).join('\n');
    }

    public static Preprocess(shaderDocument: ShaderDocument): {
        text: string,
        symbols: string[],
        predefined: { [key: string]: string },
        addedLines: number
    }
    {
        let text: string = shaderDocument.text;
        if (shaderDocument.fileName.endsWith(".ush"))
        {
            text = text.replace(/#pragma\s+once[^\n]*\n/g, '//#pragma once\n');
        }

        let symbols: string[] = [];

        let predefined: { [key: string]: string } = {};

        const re = /\/\/\s*INPUTS(?:\((\w+)\))?:\s*([^\n]+)\s*\n/g;

        let m;
        while (m = re.exec(text))
        {
            if (m.length === 1) { continue; }

            let typeName: string = 'float';

            if (m.length === 3 && typeof (m[1]) !== 'undefined')
            {
                typeName = m[1];
            }

            ((m.length === 2) ? m[1] : m[2]).split(/\s*,\s*/).forEach((symbol: string) =>
            {
                symbol = symbol.trim();
                let existingSymbol = symbols.find((s) => 0 === s.localeCompare(symbol));
                if (typeof (existingSymbol) === 'undefined' || null === existingSymbol)
                {
                    symbols.push(symbol);
                    predefined[symbol] = typeName;
                }
            });
        }

        let addedLines = 0;
        let prefix: string = "";

        Object.keys(predefined).forEach((key) =>
        {
            prefix += predefined[key] + ' ' + key + ';\n';
            addedLines = addedLines + 1;
        });

        return {
            text: prefix + text,
            symbols: symbols,
            predefined: predefined,
            addedLines: addedLines
        };
    }

    private GetProfileForShaderType(shaderType: ShaderType): string
    {
        switch(shaderType)
        {
            case ShaderType.pixel:
                return 'ps_6_4';
            case ShaderType.vertex:
                return 'vs_6_4';
            default:
                return 'ps_6_4';
        }
    }

    public CompileToSPIRV(shaderDocument: ShaderDocument)
    {
        return new Promise<string>((resolve, reject) =>
        {
            let filename = tempfile('.hlsl');

            let filenameSPIRV = tempfile('.spv');

            let cleanup = ((filename: string, filenameSPIRV: string, removeSPIRV: boolean = false) =>
            {
                fs.unlink(filename, (err: Error) => { });
                if (removeSPIRV)
                {
                    fs.unlink(filenameSPIRV, (err: Error) => { });
                }
            }).bind(this, filename, filenameSPIRV);

            let executable = this.executable || 'dxc';

            let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;

            let args: string[] = Array.from(this.defaultArgs);

            let metadata = HLSLCompiler.Preprocess(shaderDocument);

            this.includeDirs.forEach(includeDir =>
            {
                args.push("-I");
                args.push(includeDir);
            });

            shaderDocument.enabledIfdefs.forEach(ifdef =>
            {
                args.push("-D");
                args.push(ifdef);
            });

            args.push("-D");
            args.push("VSCODE_HLSL_PREVIEW");

            args.push('-T');
            args.push(this.GetProfileForShaderType(shaderDocument.shaderType));

            args.push('-E');
            args.push(shaderDocument.entryPointName);

            args.push('-Fo');
            args.push(filenameSPIRV);

            args.push(filename);

            fs.writeFile(filename, Buffer.from(metadata.text, 'utf8'), ((err: Error) =>
            {
                if (err)
                {
                    console.log('error:', err);
                    cleanup(true);
                    reject(err);
                    return;
                }

                //console.log(`Starting "${executable} ${args.join(' ')}"`);

                let childProcess = cp.spawn(executable, args, options);

                childProcess.on('error', (error: Error) =>
                {
                    console.error("Failed to start DXC:", error);

                    if (this.executableNotFound)
                    {
                        console.error("DXC executable not found");
                        cleanup(true);
                        reject(error);
                        return;
                    }

                    var message: string;

                    if ((<any>error).code === 'ENOENT')
                    {
                        message = `Cannot preview the HLSL file: The 'dxc' program was not found. Use the 'hlsl.preview.dxcExecutablePath' setting to configure the location of 'dxc'`;
                    }
                    else
                    {
                        message = error.message ? error.message : `Failed to run dxc using path: ${executable}. Reason is unknown.`;
                    }

                    this.executableNotFound = true;

                    cleanup(true);
                    reject(message);
                });

                let stderr = "";
                childProcess.stderr.on('data', (buffer: Buffer) =>
                {
                    stderr += buffer.toString();
                });

                childProcess.on('exit', (e) =>
                {
                    cleanup();
                    if (e === 0)
                    {
                        resolve(filenameSPIRV);
                    }
                    else
                    {
                        reject(HLSLCompiler.ProcessErrorMessage(shaderDocument.fileBaseName, filename, stderr, metadata));
                    }
                });

            }).bind(this));
        });
    }

    public loadConfiguration()
    {
        let section = vscode.workspace.getConfiguration('hlsl');

        if (section)
        {
            this.executable = section.get<string>('preview.dxc.executablePath', this.executable);
            this.defaultArgs = section.get<string[]>('preview.dxc.defaultArgs', this.defaultArgs);
            this.includeDirs = section.get<string[]>('preview.dxc.includeDirs') || [];
        }
    }

}
