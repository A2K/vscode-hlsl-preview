'use strict';

import * as cp from 'child_process';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as tempfile from 'tempfile';


export default class HLSLCompiler {

    private executable: string = "dxc";

    private executableNotFound: boolean = false;

    private includeDirs: string[] = [];

    private defaultArgs: string[] = [];

    constructor() {
        this.loadConfiguration();
    }

    private processErrorMessage(filename: string, tmpFilename: string, message: string, lineOffset: number): string {

        return message.split(/\n/g).map(line => {
            if (line.toLowerCase().startsWith(tmpFilename.toLowerCase())) {
                let errorMessage = line.substr(tmpFilename.length);
                let parts = errorMessage.split(':');
                parts[1] = (parseInt(parts[1]) + lineOffset).toString();
                return filename + parts.join(':');
            }
            return line;
        }).join('\n');
    }

    public CompileToSPIRV(textDocument: vscode.TextDocument, entryPointName: string, profile: string = "ps_6_4"): Promise<string> {

        return new Promise<string>((resolve, reject) => {

            let filename = tempfile('.hlsl');

            let filenameSPIRV = tempfile('.spv');

            let cleanup = ((filename: string, filenameSPIRV: string, removeSPIRV: boolean = false) => {
                fs.unlink(filename, (err: Error) => { });
                if (removeSPIRV) {
                    fs.unlink(filenameSPIRV, (err: Error) => { });
                }
            }).bind(this, filename, filenameSPIRV);

            let text = textDocument.getText();
            if (textDocument.fileName.endsWith(".ush")) {
                text = text.replace(/#pragma\s+once[^\n]*\n/g, '//#pragma once\n');
            }

            let executable = this.executable || 'dxc';

            let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;

            let args: string[] = Array.from(this.defaultArgs);

            const re = /\/\/\s*INPUTS(?:\((\w+)\))?:\s*([^\n]+)\s*\n/g;

            var symbols: string[] = [];

            var predefined: { [key: string]: string } = {};

            var m;
            while (m = re.exec(text)) {

                if (m.length === 1) {
                    continue;
                }

                var typeName: string = 'float';

                if (m.length === 3 && typeof (m[1]) !== 'undefined') {
                    typeName = m[1];
                }

                ((m.length === 2) ? m[1] : m[2]).split(/\s*,\s*/).forEach((symbol: string) => {
                    symbol = symbol.trim();
                    var existingSymbol = symbols.find((s) => 0 === s.localeCompare(symbol));
                    if (typeof (existingSymbol) === 'undefined' || null === existingSymbol) {
                        symbols.push(symbol);                        
                        predefined[symbol] = typeName;
                    }
                });
            }

            for (var includeDir in this.includeDirs) {
                args.push("-I");
                args.push(includeDir);
            }

            args.push('-T');
            args.push(profile);

            args.push('-spirv');

            args.push('-Od');
            args.push('-fspv-reflect');

            args.push('-E');
            args.push(entryPointName);

            args.push('-Fo');
            args.push(filenameSPIRV);

            //args.push('-fspv-target-env=vulkan1.1');
            args.push('-Ges');

            args.push(filename);

            var addedLines = 0;
            let prefix: string = "";
            Object.keys(predefined).forEach((key) => {
                prefix += predefined[key] + ' ' + key + ';\n';
                addedLines = addedLines + 1;
            });

            text = prefix + text;

            fs.writeFile(filename, Buffer.from(text, 'utf8'), ((err: Error) => {

                if (err) {
                    console.log('error:', err);
                    cleanup(true);
                    reject(err);
                    return;
                }

                //console.log(`Starting "${executable} ${args.join(' ')}"`);

                let childProcess = cp.spawn(executable, args, options);

                childProcess.on('error', (error: Error) => {
                    console.error("Failed to start DXC:", error);
                    if (this.executableNotFound) {
                        console.error("DXC executable not found");
                        cleanup(true);
                        reject(error);
                        return;
                    }
                    var message: string;
                    if ((<any>error).code === 'ENOENT') {
                        message = `Cannot lint the HLSL file. The 'dxc' program was not found. Use the 'hlsl.linter.executablePath' setting to configure the location of 'dxc'`;
                    } else {
                        message = error.message ? error.message : `Failed to run dxc using path: ${executable}. Reason is unknown.`;
                    }
                    console.log(message);
                    this.executableNotFound = true;
                    cleanup(true);
                    reject(message);
                });

                let stderr = "";
                childProcess.stderr.on('data', (buffer: Buffer) => {
                    stderr += buffer.toString();
                });

                childProcess.stderr.on('end', (buffer: Buffer) => {
                    if (stderr) {
                        //console.log('stderr: ' + stderr);
                    }
                });

                childProcess.on('exit', (e) => {

                    //console.log('dxc exit event:', e);
                    
                    cleanup();
                    if (e === 0) {
                        resolve(filenameSPIRV);
                    } else {
                        reject(this.processErrorMessage(textDocument.fileName, filename, stderr, -addedLines));
                    }
                });

            }).bind(this));
        });
    }

    private loadConfiguration(): void {
        let section = vscode.workspace.getConfiguration('hlsl');

        if (section) {
            this.executable = section.get<string>('preview.executablePath', "D:\\Desktop\\DXC\\bin\\dxc.exe");
            this.includeDirs = section.get<string[]>('preview.includeDirs') || [];
            this.defaultArgs = section.get<string[]>('preview.defaultArgs') || [];
        }
    }

}

/*
export function activate(context: vscode.ExtensionContext): void {
    let linter = new HLSLLintingProvider();
    linter.activate(context.subscriptions);
}
*/
