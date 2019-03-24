import * as vscode from 'vscode';

import { ShaderType } from './Enums';

import * as Utils from './Utils';
import * as WebUtils from './WebView/WebUtils';
import GLSLCode from './GLSLCode';
import { MergeObjects } from './WebView/WebUtils';


export default class ShaderDocument
{
    public isBeingUpdated: boolean = false;

    public includeDirs: string[] = [];

    private context: vscode.ExtensionContext;

	public document: vscode.TextDocument;
	public shaderType: ShaderType;
	public entryPointName: string = "main";
	public documentId: number;

    public lastCompiledCode: string | undefined;

	public lastUpdateVersion: number | undefined = undefined;
    public glslCode: GLSLCode | undefined = undefined;

    public promises: { resolve: any, reject: any, version: number }[] = [];

    private _needsUpdate: boolean = true;

    public lastCompiledIfdefs: string[] = [];

    public bufferName: string | undefined;

	public async getNeedsUpdate(): Promise<boolean>
	{
        if (this._needsUpdate) { return true; }

        let preprocessedCode = await this.getPreprocessedCode();

        if (this.lastCompiledCode !== preprocessedCode) { return true; }

        return !WebUtils.ArraysEqual(this.lastCompiledIfdefs, await this.getEnabledIfdefs());
    }

    public setNeedsUpdate(value: boolean = true)
    {
        this._needsUpdate = value;
    }

	public get text(): string
	{
		return this.document.getText();
    }

    public async getPreprocessedCode(): Promise<string>
    {
        let unresolved = new Utils.UnresolvedIncludes();
        let code = await Utils.ResolveIncludes(this.fileName, this.text, this.includeDirs, unresolved);
        if (unresolved.length)
        {
            console.error('UNRESOLVED INCLUDES:', unresolved.filenames.join(', '));

            unresolved.includes.map(i =>
            {
                let pairs: {filename: string, parent: string, line: number }[] = [];

                i.parents.forEach(p =>
                {
                    pairs.push({filename: i.filename, parent: p.filename, line: p.charIndex});
                });

                vscode.window.showErrorMessage('Failed to resolve includes:\n' +
                    pairs.map(p => `${p.filename} at ${p.parent}:${p.line}`).join('\n')
                );
            });

            return this.text;
        }

        return code;
    }

	public get version(): number
	{
		return this.document.version;
	}

	public get uri(): vscode.Uri
	{
		return this.document.uri;
	}

	public get fileName(): string
	{
		return this.document.fileName;
    }

    public get fileBaseName(): string
    {
        return this.fileName.split(/[/\\]/).pop() || this.fileName;
    }

    public get directory(): string
    {
        // let filename = this.document.uri.fsPath;
        let filename = this.document.fileName;
        let parts = filename.split(/(?:\/|\\)/);
        parts.pop();
        return parts.join('\\');
    }

    private _ifdefs: string[] = [];
    private _ifdefs_update_version: number | undefined = undefined;

    public async getIfdefs(): Promise<string[]>
    {
        if (this.version !== this._ifdefs_update_version)
        {
            this._ifdefs = await Utils.GetIfdefs(this.fileName, this.text, this.includeDirs);
            this._ifdefs_update_version = this.version;
        }

        return this._ifdefs;
    }

    private get uniformsSettingsKey(): string
    {
        return 'uniforms_' + this.document.uri.toString();
    }

    public loadUniformsValues(): object
    {
        if (this.shaderType === ShaderType.buffer)
        {
            let data = this.context.workspaceState.get(this.uniformsSettingsKey + '__' + this.bufferName, {});
            if (data)
            {
                return data;
            }
        }

		return this.context.workspaceState.get(this.uniformsSettingsKey, {});
    }

    public saveUniformsValues(value: object)
    {
        if (this.shaderType === ShaderType.buffer)
        {
            this.context.workspaceState.update(this.uniformsSettingsKey + '__' + this.bufferName, value);
        }
        else
        {
            this.context.workspaceState.update(this.uniformsSettingsKey, value);
        }
    }

    private get enabledIfdefsSettingsKey(): string
    {
        if (this.shaderType === ShaderType.buffer)
        {
            return 'ifdefs_' + this.uri.toString() + '__' + this.bufferName;
        }
        return 'ifdefs_' + this.uri.toString();
    }

    private get enabledIfdefsVersionSettingsKey(): string
    {
        if (this.shaderType === ShaderType.buffer)
        {
            return 'ifdefs_version_' + this.uri.toString() + '__' + this.bufferName;
        }
        return 'ifdefs_version_' + this.uri.toString();
    }

    public async getEnabledIfdefs(): Promise<string[]>
    {
        let key = this.enabledIfdefsSettingsKey;

        let versionKey = this.enabledIfdefsVersionSettingsKey;

        if (this.version === this.context.workspaceState.get<number>(versionKey))
        {
            return this.context.workspaceState.get<string[]>(key) || [];
        }
        else
        {
            let savedIfdefs = this.context.workspaceState.get<string[]>(key);

            if (savedIfdefs)
            {
                let currentIfdefs = await this.getIfdefs();
                return savedIfdefs.filter(
                    (savedIfdef: string): boolean =>
                    {
                        return currentIfdefs.indexOf(savedIfdef) >= 0;
                    }
                );
            }
            else
            {
                return [];
            }
        }
    }

    public async setEnabledIfdefs(newEnabledIfdefs: string[])
    {
        if (WebUtils.ArraysEqual(newEnabledIfdefs, await this.getEnabledIfdefs()))
        {
            this._needsUpdate = true;
        }

        let currentIfdefs = await this.getIfdefs();

        this.context.workspaceState.update(
            this.enabledIfdefsSettingsKey,
            newEnabledIfdefs.filter(
                (newIfdef: string): boolean =>
                {
                    return currentIfdefs.indexOf(newIfdef) >= 0;
                }
            )
        );

        this.context.workspaceState.update(
            this.enabledIfdefsVersionSettingsKey,
            newEnabledIfdefs
        );
    }

    public code: string | undefined = undefined;

    public reflection: { [key:string]: any } = {};

    public get textures(): { [key:string]: string }
	{
		let result: { [key:string]: string } = {};

        if (this.reflection && this.reflection.separate_images)
        {
            this.reflection.separate_images.forEach(
                (tex: { [key:string]: any }) =>
                {
                    result[tex['name']] = tex['type'];
                }
            );
		}

		return result;
    }

    get bufferSettingsKey(): string
    {
        return 'buffer_settings_' + this.uri.toString() + '__' + this.bufferName;
    }

    public get bufferSettings(): object
    {
        return this.context.workspaceState.get(this.bufferSettingsKey, {});
    }

    public set bufferSettings(settings: object)
    {
        let s = this.bufferSettings;
        MergeObjects(s, settings);
        this.context.workspaceState.update(this.bufferSettingsKey, s);
    }

	constructor(context: vscode.ExtensionContext, documentId:number, document: vscode.TextDocument, shaderType: ShaderType = ShaderType.pixel)
	{
        this.context = context;
		this.documentId = documentId;
		this.document = document;
		this.shaderType = shaderType;
	}
}
