import * as vscode from 'vscode';
import * as mime from 'mime-types';
import * as fs from 'fs';
import * as path from 'path';
import CachingFileReader from './FileReader';


export function LoadFileBase64(filepath: string): Promise<string>
{
	return new Promise<string>((resolve, reject) => {
        fs.readFile(filepath, { encoding: 'base64' },
            (err, data) =>
            {
                if (err)
                {
                    reject(err);
                }
                else
                {
                    resolve(data);
                }
            }
        );
	});
}

export function LoadFileAsDataUri(filepath: string): Promise<string>
{
	return new Promise<string>((resolve, reject) => {
		LoadFileBase64(filepath)
		.then((data: string) => {
			resolve('data:' + mime.lookup(filepath) + ';base64,' + data);
		})
		.catch(reject);
	});
}

export function RemoveComments(text: string): string
{
	const comment_re = /(\/\/[^\n]*$|\/(?!\\)\*[\s\S]*?\*(?!\\)\/)/mg;
	return text.replace(comment_re, '');
}

export function FileExists(filename: string): boolean
{
	filename = path.normalize(filename);

	if (vscode.workspace.textDocuments.findIndex(
			(doc: vscode.TextDocument) => path.normalize(doc.fileName) === filename
		) >= 0)
	{
		return true;
	}

	return fs.existsSync(filename);
}

export async function GetFileText(filename: string): Promise<string>
{
	filename = path.normalize(filename);

	let doc = vscode.workspace.textDocuments.find(
		(doc: vscode.TextDocument) => path.normalize(doc.fileName) === filename
	);

	if (doc)
	{
		return doc.getText();
	}
	else
	{
		return CachingFileReader.readFile(filename);
	}

}

export class ResolvedInclude
{
	public filename: string;
	public depth: number;
	public data: string;

	public parents: Set<string> = new Set();

	constructor(filename: string, parent:string, depth: number, data: string = '')
	{
		this.filename = filename;
		this.depth = depth;
		this.data = data;
		this.parents.add(parent);
	}
}

export class ResolvedIncludes
{
	public includes: { [key: string]: ResolvedInclude } = {};

	constructor()
	{
	}

	add(include: ResolvedInclude)
	{
		if (include.filename in this.includes)
		{
			this.includes[include.filename].depth = Math.max(this.includes[include.filename].depth, include.depth);
			if (include.data)
			{
				this.includes[include.filename].data = include.data;
			}
		}
		this.includes[include.filename] = include;
	}

	get sortedByDepth(): ResolvedInclude[]
	{
		let keys = Object.keys(this.includes);
		keys.sort((a, b) => this.includes[a].depth - this.includes[b].depth);
		return keys.map(key => this.includes[key]);
	}

	public contains(includePath: string): boolean
	{
		return includePath in this.includes;
	}

	public updateDepth(includePath:string, parent: string, depth: number, updated: Set<string> = new Set())
	{
		if (updated.has(includePath))
		{
			throw new Error('Include loop detected: ' + includePath + ' in ' + parent);
		}

		this.includes[includePath].depth = Math.max(this.includes[includePath].depth, depth);
		updated.add(includePath);
		Object.keys(this.includes)
		.map(key => this.includes[key])
		.forEach(include => {
			if (include.parents.has(includePath))
			{
				this.updateDepth(include.filename, includePath, depth + 1, updated);
			}
		});

		return true;
	}
}

export class UnresolvedInclude
{
	public filename: string;
	public parents: { filename: string, charIndex: number }[];

	constructor(filename: string, parents: { filename: string, charIndex: number }[])
	{
		this.filename = filename;
		this.parents = parents;
	}
}

export class UnresolvedIncludes
{
	public map: { [key: string]: UnresolvedInclude } = {};

	constructor()
	{
	}

	add(include: UnresolvedInclude)
	{
		if (include.filename in this.map)
		{
			include.parents
			.filter(p =>
				this.map[include.filename].parents.find(pp =>
					pp.filename === p.filename && pp.charIndex === p.charIndex
				)
			)
			.forEach(p => this.map[include.filename].parents.push(p));
		}
		else
		{
			this.map[include.filename] = include;
		}
	}

	get length()
	{
		return Object.keys(this.map).length;
	}

	get includes()
	{
		return Object.keys(this.map).map(k => this.map[k]);
	}

	get filenames()
	{
		return Object.keys(this.map).map(k => this.map[k].filename);
	}

}
export function FindInclude(filename: string, includeDirs: string[]): string | undefined
{
	let parts = filename.split(/(?:\/|\\)/);
	let basename = parts.pop() || filename;

	for(let i = 0; i < includeDirs.length; ++i)
	{
		let joined = path.join(includeDirs[i], basename);
		if (FileExists(joined))
		{
			return joined;
		}
	}
}

export async function FindAllIncludes(filename: string, code: string, includeDirs: string[],
								resolved: ResolvedIncludes = new ResolvedIncludes(),
								unresolved: UnresolvedIncludes = new UnresolvedIncludes(),
								depth: number = 0): Promise<ResolvedIncludes>
{
	let validIncludes:string[] = GetIncludes(code);

	for(let i = 0; i < validIncludes.length; ++i)
	{
		let includeName = validIncludes[i];

		let includePath = FindInclude(includeName, includeDirs);

		if (includePath)
		{
			let existingInclude = resolved.contains(includePath);

			if (existingInclude)
			{
				if (!resolved.updateDepth(includePath, filename, depth))
				{
					continue;
				}
			}

			let data = await GetFileText(includePath);

			if (!existingInclude)
			{
				resolved.add(new ResolvedInclude(includePath, filename, depth, data));
			}

			await FindAllIncludes(includePath, data, includeDirs, resolved, unresolved, depth + 1);
		}
		else
		{
			unresolved.add(new UnresolvedInclude(path.normalize(includeName), [{ filename: filename, charIndex: 0 }]));
		}
	}

	return resolved;
}

// TODO: cache includes, check timestamps
export async function ResolveIncludes(filename: string, code: string, includeDirs: string[], unresolved = new UnresolvedIncludes()): Promise<string>
{
	let includes: ResolvedIncludes = new ResolvedIncludes();

	await FindAllIncludes(filename, code, includeDirs, includes, unresolved);

	let prefix = '';

	includes.sortedByDepth.forEach((include: ResolvedInclude) =>
	{
		let filename = include.filename.replace(/\\+/gm, '/');
		prefix = `#line 1 "${filename}"\n` +
				 `${include.data}\n` +
				 prefix;
	});

	code = `${prefix}\n` +
		   `#line 1 "${filename.replace(/\\+/gm, '/')}"\n` +
		   `${code}`;

	const re = /^\h*#include\s+[<"]([^>"]+)[">]/gm;
	code = code.replace(re, '');

	code = code.replace(/#pragma\s+once/gm, '');

	return code;
}

export async function GetIfdefs(filename: string, text: string, includeDirs: string[]): Promise<string[]>
{
	let ifdefs:string[] = [];

	let codeWithIncludes = await ResolveIncludes(filename, text, includeDirs);

	let nocomments = RemoveComments(codeWithIncludes);

	const re = /^\s*#if(?:def\s+|\s+defined\(\s*)(\w+)\)?\s*$/gm;
	var m;
	while (m = re.exec(nocomments)) {
		let name = m[1];
		if (name === 'VSCODE_HLSL_PREVIEW') {
			continue;
		}
		if (ifdefs.indexOf(name) < 0) {
			ifdefs.push(name);
		}
	}

	return ifdefs;
}

export function GetIncludes(code: string): string[]
{
	const re = /^\h*#include\s+[<"]([^>"]+)[">]/gm;

	let includes:string[] = [];

	let codeWithoutComments = RemoveComments(code);
	let m:RegExpExecArray|null = null;
	while(m = re.exec(codeWithoutComments))
	{
		let includeName = m[1];
		if (includes.indexOf(includeName) < 0)
		{
			includes.push(includeName);
		}
	}

	return includes;
}
