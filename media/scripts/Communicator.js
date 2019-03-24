

class Communicator extends EventEmitter
{
    constructor()
    {
        super();

        this.vscode = acquireVsCodeApi();

        $(window).on('message', this.processMessage.bind(this));

        // this.postMessage('ready'); // TODO: find a better time/place to send this
    }

    postMessage(type, data)
    {
        this.vscode.postMessage({ type: type, data: data });
    }

    processMessage(e)
    {
        let event = e.originalEvent.data;
        this.emit(`message.${event.command}`, event.data);
    }

    getNextOpId()
    {
        return this.__lastOpId
            ? (this.__lastOpId++)
            : (this.__lastOpId = 1);
    }

    requestData()
    {
        this.postMessage('update', { opId: this.getNextOpId() });

        this.postMessage('getUniforms', { opId: this.getNextOpId() });

        this.postMessage('getSettings', { opId: this.getNextOpId() });
    }
}
