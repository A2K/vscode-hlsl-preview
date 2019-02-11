import * as mime from 'mime-types';
import * as fs from 'fs';


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

export function GetIfdefs(text: string): string[]
{
	let ifdefs:string[] = [];

	let comment_re = /(\"[^\"]*\"(?!\\))|(\/\/[^\n]*$|\/(?!\\)\*[\s\S]*?\*(?!\\)\/)/mg;
	let nocomments = text.replace(comment_re, '');

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