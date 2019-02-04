'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';

import GLSLCompiler, { GLSLCode } from './glsl';
import HLSLCompiler from './dxc';


export default class HLSLtoGLSLRecompiler {
    
    private hlsl: HLSLCompiler = new HLSLCompiler();
    private glsl: GLSLCompiler = new GLSLCompiler();

    public HLSL2GLSL(textDocument: vscode.TextDocument, entryPointName: string, enabledIfdefs: string[]): Promise<GLSLCode> {
        
        return new Promise<GLSLCode>((resolve, reject) => {

            this.hlsl.CompileToSPIRV(textDocument, entryPointName, enabledIfdefs).then((filename) => {

                if (filename) {
                    this.glsl.Process(filename)
                    .then((glslCode) => {
                        fs.unlink(filename, () => {});
                        resolve(glslCode);
                    })
                    .catch(reject);
                } else {
                    reject("no SPIRV file generated");
                }
                
            }).catch((reason) => {
                reject(reason);
            });

        });
    }
}
