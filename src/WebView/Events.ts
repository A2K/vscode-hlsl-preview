

var eventSequenceNumber = 1;


class Event
{
    public sequenceNumber: number;

    public emitter: EventEmitter;

    public name: string;
    public data: any | undefined;
    public precursor: Event | undefined;

    public toString(): string
    {
        return `[Event(id=${this.sequenceNumber},name=${this.name},emitter=${this.emitter.getEmitterName()})]`;
    }

    constructor(emitter:EventEmitter, name: string, data?: any, precursor?: Event)
    {
        this.sequenceNumber = eventSequenceNumber++;

        this.emitter = emitter;

        if (data instanceof Event)
        {
            precursor = data;
            data = undefined;
        }

        if (precursor)
        {
            this.precursor = precursor;
            this.name = Event.getCombinedEventName(precursor, name);
        }
        else
        {
            this.name = name;
        }

        this.data = data;
    }

    getInitialEvent()
    {
        let event: Event = this;

        while(typeof(event.precursor) !== 'undefined')
        {
            event = event.precursor;
        }

        return event;
    }

    static getCombinedEventName(precursor: Event, name: string): string
    {
        let precursorParts = precursor.name.split('.');
        let nameParts = name.split('.');

        let result: string[] = [];

        while(nameParts.length && precursorParts.length && nameParts[0] === precursorParts[0])
        {
            result.push(precursorParts[0]);
            precursorParts.shift();
            nameParts.shift();
        }

        result = result.concat(nameParts);
        result = result.concat(precursorParts);

        return result.join('.');
    }

    matches(filter: string): boolean
    {
        return Event.nameMatchesFilter(this.name, filter);
    }

    static nameMatchesFilter(name: string, filter: string): boolean
    {
        if (name === filter || name.startsWith(filter + '.'))
        {
            return true;
        }

        let nameParts = name.split('.');
        let filterParts = filter.split('.');

        while(nameParts.length)
        {
            let part = nameParts.shift();

            if (filterParts.length)
            {
                if (part !== filterParts[0] && filterParts[0] !== '*' && part !== '*')
                {
                    return false;
                }
            }
            else if (part !== '*')
            {
                return false;
            }

            filterParts.shift();
        }

        return true;
    }
}

class EventEmitter
{
    public DEBUG:boolean = false;

    private __emitterName: string;

    private __events: { [key: string]: Set<((event: Event) => any)> } = {};

    private __enabledEvents: Set<string> = new Set<string>();

    dispose()
    {
        Object.keys(this.__events).forEach(key => {
            this.__events[key].clear();
            delete this.__events[key]
        });
        delete this.__events;
    }

    private __GetEventListeners(event: string): Set<((event: Event) => any)>
    {
        let listeners: Set<((event: Event) => any)> = new Set();

        this.__getMatchingEventNames(event)
            .forEach(key => {
                this.__events[key]
                    .forEach(listener => listeners.add(listener));
            });

        return listeners;
    }

    private __GetOrCreateEventListeners(event: string): Set<((event: Event) => any)>
    {
        ['0', '1', '2'].map(parseInt);
        return (event in this.__events)
               ? this.__events[event]
               : (this.__events[event] = new Set());
    }

    private __isValidEvent(event: string): boolean
    {
        if (!this.__enabledEvents.size)
        {
            return true;
        }

        let result = false;

        this.__enabledEvents.forEach((e) =>
        {
            result = result || Event.nameMatchesFilter(e, event);
        });

        return result;
    }

    private __getMatchingEventNames(event: string): string[]
    {
        return Object.keys(this.__events)
                .filter(key => Event.nameMatchesFilter(key, event));
    }

    constructor(emitterName?: string)
    {
        this.__emitterName = emitterName || this.constructor.name;
    }

    public getEmitterName()
    {
        return this.__emitterName;
    }

    public declareEvent(name: string)
    {
        this.__enabledEvents.add(name);
    }

    public getDeclaredEvents(): string[]
    {
        return Array.from(this.__enabledEvents);
    }

    public on(events: string, listener: (event: Event) => any): void
    {
        events.split(/\s+/).forEach(event =>
        {
            if (!this.__isValidEvent(event))
            {
                console.warn('EventEmitter: attempted to subscribe to unknown event: ' + event);
                return;
            }
            this.__GetOrCreateEventListeners(event).add(listener);
        });
    }

    public off(events: string, listener?: (event: Event) => any): void
    {
        if (listener)
        {
            events.split(/\s+/).forEach(event =>
            {
                if (!this.__isValidEvent(event))
                {
                    console.warn('EventEmitter: attempted to unsubscribe froim unknown event:', event);
                    return;
                }

                let listeners = this.__GetEventListeners(event);
                if (listeners)
                {
                    listeners.delete(listener);
                }
            });
        }
        else
        {
            events.split(/\s+/).forEach(event =>
            {
                if (!this.__isValidEvent(event))
                {
                    console.warn('EventEmitter: attempted to unsubscribe froim unknown event:', event);
                    return;
                }

                let removeKeys = Object.keys(this.__events)
                    .filter(key => key === event || key.startsWith(event + '.'));

                removeKeys.forEach(key => delete this.__events[key]);
            });
        }
    }

    public emit(eventName: string, data?: any, precursor?: Event): void
    {
        if (this.__enabledEvents.size && !this.__enabledEvents.has(eventName))
        {
            console.warn('EventEmitter: attempted to trigger unknown event: ' + eventName);
            console.info('EventEmitter: object class: ' + this.constructor.name);
            console.info('EventEmitter: declared events are: ' + JSON.stringify(this.getDeclaredEvents()));
            return;
        }

        let event = new Event(this, eventName, data, precursor);

        let listeners = this.__GetEventListeners(event.name);
        if (listeners)
        {
            listeners.forEach(listener => {
                if (this.DEBUG) {
                    console.log(`event ${event.name} in ${this.constructor.name} handled by`, listener);
                }
                listener(event);
            });
        }
        else
        {
            if (this.DEBUG) {
                console.warn(`Events: emit: no listeners found for event ${eventName} on ${this.constructor.name}`);
            }
        }
    }
}
