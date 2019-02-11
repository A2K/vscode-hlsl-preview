import * as vscode from 'vscode';

import HLSLPreview from './HLSLPreview';


export function activate(context: vscode.ExtensionContext)
{
	let preview = new HLSLPreview(context);

	vscode.commands.registerCommand(
		'hlsl.preview.start',
		preview.onStartCommand.bind(preview)
	);
}

export function deactivate()
{

}
