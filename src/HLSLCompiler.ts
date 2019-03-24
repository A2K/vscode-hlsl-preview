'use strict';

import * as vscode from 'vscode';

import * as fs from 'fs';
import * as cp from 'child_process';
import * as tempfile from 'tempfile';

import ShaderDocument from './ShaderDocument';
import * as Utils from './Utils';
import { ShaderType } from './Enums';
import CachingFileReader from './FileReader';
import SyntaxTreeParser, { SyntaxTreeNode } from './SyntaxTreeParser';


export class HLSLCompileResult
{
    public filename: string;
    public stderr: string;
    public inputFileName: string;
    public inputs: { [key: string]: string };

    public _data: string | undefined;

    constructor(filename: string, stderr: string, inputFileName: string, inputs: { [key: string]: string })
    {
        this.filename = filename;
        this.stderr = stderr;
        this.inputFileName = inputFileName;
        this.inputs = inputs;
    }

    ReadDataSync(encoding:string = 'utf8'): string
    {
        return fs.readFileSync(this.filename, { encoding: encoding });
    }

    async ReadData(encoding:string = 'utf8'): Promise<string>
    {
        return new Promise<string>((resolve, reject) =>
        {
            fs.readFile(this.filename, { encoding: encoding }, (err: NodeJS.ErrnoException, data: string) => {
                if (err)
                {
                    reject(err);
                }
                else
                {
                    resolve(data);
                }
            });
        });
    }
}

export default class HLSLCompiler
{

    private executable: string = "dxc";

    private executableNotFound: boolean = false;

    public includeDirs: string[] = [ '.' ];

    private defaultArgs: string[] = [ "-Od", "-Ges", "-Zi", '-Gfp' ];
    private spirvArgs: string[] = [ "-spirv", "-fspv-reflect", "-fspv-target-env=vulkan1.0" ];

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
                // parts[1] = (parseInt(parts[1]) - metadata.addedLines).toString();
                return filename + parts.join(':');
            }
            return line;
        }).join('\n');
    }

    public static async Preprocess(shaderDocument: ShaderDocument, inputs: { [key: string]: string }): Promise<{
        text: string,
        predefined: { [key: string]: string },
        addedLines: number
    }>
    {
        let text: string = await shaderDocument.getPreprocessedCode();
        if (shaderDocument.fileName.endsWith(".ush"))
        {
            text = text.replace(/#pragma\s+once[^\n]*\n/g, '//#pragma once\n');
        }

        let addedLines = 0;
        let prefix: string = "";

        Object.keys(inputs).forEach((key) =>
        {
            prefix += inputs[key] + ' ' + key + ';\n';
            addedLines = addedLines + 1;
        });

        return {
            text: prefix + text,
            predefined: inputs,
            addedLines: addedLines
        };
    }

    public static async GetInputs(filename: string, text: string, includeDirs: string[]): Promise<{ [key: string]: string }>
    {
        let predefined: { [key: string]: string } = {};

        const re = /\/\/\s*INPUTS(?:\((\w+)\))?:\s*([^\n]+)\s*\n/g;

        // text = await ResolveIncludes(filename, text, includeDirs);

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
                if (!(symbol in predefined))
                {
                    if (/^Texture\dD(?:Array)?$/.test(typeName))
                    {
                        let samplerName = `${symbol}Sampler`;
                        if (!(samplerName in predefined))
                        {
                            predefined[samplerName] = 'SamplerState';
                        }
                    }

                    predefined[symbol] = typeName;
                }
            });
        }

        return predefined;
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

    public static ParseIncludes(text: string): string[]
    {
        let includes:string[] = [];

        const re = /^\s*#\s*line \d+ "([^"]+)"\s*$/gm;

        let m;
        while (m = re.exec(text))
        {
            let name = m[1];
            if (includes.indexOf(name) < 0)
            {
                includes.push(name);
            }
        }

        return includes;
    }

    public async CompilePreprocess(shaderDocument: ShaderDocument): Promise<HLSLCompileResult>
    {
        let inputs = await HLSLCompiler.GetInputs(shaderDocument.fileName, shaderDocument.text, shaderDocument.includeDirs);

        return this.ExecuteDXC(shaderDocument, inputs, ['-H'], true);
    }

    public async GetSyntaxTree(shaderDocument: ShaderDocument): Promise<SyntaxTreeNode>
    {
        let inputs = await HLSLCompiler.GetInputs(
            shaderDocument.fileName,
                await shaderDocument.getPreprocessedCode(),
                shaderDocument.includeDirs);

        let data = await this.ExecuteDXCDumpAST(shaderDocument, inputs, ['-ast-dump']);

        return SyntaxTreeParser.Parse(data);
    }

    public async CompileToSPIRV(shaderDocument: ShaderDocument): Promise<HLSLCompileResult>
    {
        let preprocessResult: HLSLCompileResult = await this.CompilePreprocess(shaderDocument);

        let inputs = {};

        let code = await preprocessResult.ReadData();
        let includes = HLSLCompiler.ParseIncludes(code);
        for(let i = 0; i < includes.length; ++i)
        {
            let filename = includes[i].replace(/\\\\/gm, '\\');

            if (filename === preprocessResult.inputFileName)
            {
                continue;
            }

            let fileInputs = await HLSLCompiler.GetInputs(
                filename,
                await Utils.GetFileText(filename),
                shaderDocument.includeDirs);

            Object.assign(inputs, fileInputs);
        }

        return this.ExecuteDXC(shaderDocument, inputs, this.spirvArgs, false);
    }

    public async ExecuteDXC(shaderDocument: ShaderDocument,
                      inputs: { [key: string]: string },
                      extraArgs: string[],
                      PreprocessOnly: boolean = false): Promise<HLSLCompileResult>
    {
        let filename = tempfile('.hlsl');

        let filenameSPIRV = tempfile('.spv');

        let executable = this.executable || 'dxc';

        let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;

        let args: string[] = Array.from(this.defaultArgs);

        if (extraArgs.length)
        {
            args = args.concat(extraArgs);
        }

        let metadata = await HLSLCompiler.Preprocess(shaderDocument, inputs);

        shaderDocument.includeDirs.forEach(includeDir =>
        {
            args.push("-I");
            args.push(includeDir);
        });

        // if (shaderDocument.directory)
        // {
        //     args.push("-I");
        //     args.push(shaderDocument.directory + '\\');
        // }

        (await shaderDocument.getEnabledIfdefs()).forEach(ifdef =>
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

        args.push(PreprocessOnly ? '-P' :'-Fo');
        args.push(filenameSPIRV);

        args.push(filename);

        let cleanup = ((filename: string, filenameSPIRV: string, removeSPIRV: boolean = false) =>
        {
            fs.unlink(filename, (err: Error) => { });
            if (removeSPIRV)
            {
                fs.unlink(filenameSPIRV, (err: Error) => { });
            }
        }).bind(this, filename, filenameSPIRV);

        await new Promise<void>((resolve, reject) => {
            fs.writeFile(filename, Buffer.from(metadata.text, 'utf8'), ((err: Error) =>
            {
                if (err)
                {
                    console.log('error:', err);
                    cleanup(true);
                    reject(err);
                }
                else
                {
                    resolve();
                }
            }));
        });

        return new Promise<HLSLCompileResult>((resolve, reject) =>
        {
            // console.log('Starting DXC:', executable, args.join(' '));

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
                    message = `Cannot preview the HLSL file: The 'dxc' program was not found. Use the 'hlsl.preview.dxc.executablePath' setting to configure the location of 'dxc'`;
                }
                else
                {
                    message = error.message ? error.message : `Failed to run dxc: ${executable}. Reason is unknown.`;
                }

                this.executableNotFound = true;

                cleanup(true);
                reject(message);
            });


            let stdout = "";
            childProcess.stdout.on('data', (buffer: Buffer) =>
            {
                stdout += buffer.toString();
            });

            let stderr = "";
            childProcess.stderr.on('data', (buffer: Buffer) =>
            {
                stderr += buffer.toString();
            });

            childProcess.on('exit', (e) =>
            {
                // console.log('DXC EXITED:', e);

                if (stderr)
                {
                    // console.error(stderr);
                }
                if (stdout)
                {
                    console.log(stdout);
                }

                cleanup();

                if (e === 0)
                {
                    if (stderr)
                    {
                        CachingFileReader.fileExists(filenameSPIRV).then((fileExists: boolean) => {
                            if (fileExists)
                            {
                                resolve(new HLSLCompileResult(filenameSPIRV, stderr, filename, inputs));
                            }
                            else
                            {
                                reject(HLSLCompiler.ProcessErrorMessage(shaderDocument.fileBaseName, filename, stderr, metadata));
                            }
                        });
                    }
                    else
                    {
                        resolve(new HLSLCompileResult(filenameSPIRV, stderr, filename, inputs));
                    }
                }
                else
                {
                    reject(HLSLCompiler.ProcessErrorMessage(shaderDocument.fileBaseName, filename, stderr, metadata));
                }
            });
        });
    }

    public async ExecuteDXCDumpAST(shaderDocument: ShaderDocument,
        inputs: { [key: string]: string },
        extraArgs: string[]): Promise<string>
    {
        let filename = tempfile('.hlsl');

        let executable = this.executable || 'dxc';

        let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;

        let args: string[] = Array.from(this.defaultArgs);

        if (extraArgs.length) {
            args = args.concat(extraArgs);
        }

        let metadata = await HLSLCompiler.Preprocess(shaderDocument, inputs);

        shaderDocument.includeDirs.forEach(includeDir => {
            args.push("-I");
            args.push(includeDir);
        });

        // if (shaderDocument.directory)
        // {
        //     args.push("-I");
        //     args.push(shaderDocument.directory + '\\');
        // }

        (await shaderDocument.getEnabledIfdefs()).forEach(ifdef => {
            args.push("-D");
            args.push(ifdef);
        });

        args.push("-D");
        args.push("VSCODE_HLSL_PREVIEW");

        args.push('-T');
        args.push(this.GetProfileForShaderType(shaderDocument.shaderType));

        args.push(filename);

        let cleanup = ((filename: string) => {
            fs.unlink(filename, (err: Error) => { });
        }).bind(this, filename);

        await new Promise<void>((resolve, reject) => {
            fs.writeFile(filename, Buffer.from(metadata.text, 'utf8'), ((err: Error) => {
                if (err) {
                    console.log('error:', err);
                    cleanup();
                    reject(err);
                }
                else {
                    resolve();
                }
            }));
        });

        return new Promise<string>((resolve, reject) => {
            // console.log('Starting DXC:', executable, args.join(' '));

            let childProcess = cp.spawn(executable, args, options);

            childProcess.on('error', (error: Error) => {
                console.error("Failed to start DXC:", error);

                if (this.executableNotFound) {
                    console.error("DXC executable not found");
                    cleanup();
                    reject(error);
                    return;
                }

                var message: string;

                if ((<any>error).code === 'ENOENT') {
                    message = `Cannot preview the HLSL file: The 'dxc' program was not found. Use the 'hlsl.preview.dxc.executablePath' setting to configure the location of 'dxc'`;
                }
                else {
                    message = error.message ? error.message : `Failed to run dxc: ${executable}. Reason is unknown.`;
                }

                this.executableNotFound = true;

                cleanup();
                reject(message);
            });

            let stdout = "";
            childProcess.stdout.on('data', (buffer: Buffer) => {
                stdout += buffer.toString();
            });

            let stderr = "";
            childProcess.stderr.on('data', (buffer: Buffer) => {
                stderr += buffer.toString();
            });

            childProcess.on('exit', (e) =>
            {
                cleanup();
                if (!stdout) {
                    if (stderr) {
                        console.error(stderr);
                    }
                }

                resolve(stdout);
            });
        });
    }

    public loadConfiguration()
    {
        let section = vscode.workspace.getConfiguration('hlsl');

        if (section)
        {
            this.executable = section.get<string>('preview.dxc.executablePath', this.executable);
            this.defaultArgs = Array.from(new Set(this.defaultArgs.concat(section.get<string[]>('preview.dxc.defaultArgs', this.defaultArgs))));
            this.includeDirs = section.get<string[]>('preview.dxc.includeDirs', this.includeDirs);
            if (!this.includeDirs.length)
            {
                this.includeDirs.push('.');
            }
            this.executableNotFound = false;
        }
    }

}
