
class Clipboard
{
    static copy(str)
    {
        const el = document.createElement('textarea');
        el.value = str;
        el.setAttribute('readonly', '');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    };

    static paste()
    {
        const el = document.createElement('textarea');
        el.value = '';
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand("paste");
        let value = el.value;
        document.body.removeChild(el);
        return value;
    };


    static serialize(value, type)
    {
        const COLOR = [ 'R', 'G', 'B', 'A' ];
        const VECTOR = [ 'X', 'Y', 'Z', 'W' ];

        const V = type === 'color' ? COLOR : VECTOR;

        if (value instanceof THREE.Vector4)
        {
            return `(${V[0]}=${value.x},${V[1]}=${value.y},${V[2]}=${value.z},${V[3]}=${value.w})`;
        }
        else if (value instanceof THREE.Vector3)
        {
            return `(${V[0]}=${value.x},${V[1]}=${value.y},${V[2]}=${value.z})`;
        }
        else if (value instanceof THREE.Vector2)
        {
            return `(${V[0]}=${value.x},${V[1]}=${value.y})`;
        }

        return value + '';
    }

    static deserialize(data)
    {
        const re4 = /\([RX]=([-+]?[0-9]*\.?[0-9]+),[GY]=([-+]?[0-9]*\.?[0-9]+),[BZ]=([-+]?[0-9]*\.?[0-9]+),[AW]=([-+]?[0-9]*\.?[0-9]+)\)/;
        const re3 = /\([RX]=([-+]?[0-9]*\.?[0-9]+),[GY]=([-+]?[0-9]*\.?[0-9]+),[BZ]=([-+]?[0-9]*\.?[0-9]+)\)/;
        const re2 = /\([RX]=([-+]?[0-9]*\.?[0-9]+),[GY]=([-+]?[0-9]*\.?[0-9]+)\)/;
        const re1 = /[-+]?[0-9]*\.?[0-9]+/;

        const res = [ re4, re3, re2, re1 ];
        const types = [ THREE.Vector4, THREE.Vector3, THREE.Vector2, 'float' ];

        const run_res = () =>
        {
            for(let i = 0; i < res.length; ++i)
            {
                let re = res[i];

                var m = re.exec(data);
                if (m)
                {
                    let type = types[i];
                    if (typeof(type) !== 'function')
                    {
                        if (m.length === 1)
                        {
                            return m[0];
                        }
                        else
                        {
                            return m.slice(1).map(parseFloat);
                        }
                    }
                    else
                    {
                        m = m.slice(1).map(parseFloat);
                        m.unshift(this);
                        return new (Function.prototype.bind.apply(type, m));
                    }
                }
            }
        };

        let match = run_res();
        return match;
    }
}
