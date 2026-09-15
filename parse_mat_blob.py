"""
Minimal MAT5 'data element' reader for poking through the raw
__function_workspace__ subsystem blob of a MATLAB v7 .mat file that
holds an MCOS object (here: a DAGNetwork). This does NOT attempt full
MCOS object graph reconstruction -- just enough to decode individual
miMATRIX elements (numeric arrays / char arrays) at known byte offsets
so we can read out the ImageInputLayer's Normalization Mean/Std/ImageSize
values with certainty instead of guessing from a hex dump.
"""
import struct
import scipy.io as sio

MI_TYPES = {
    1: ('miINT8', 'b'), 2: ('miUINT8', 'B'), 3: ('miINT16', 'h'), 4: ('miUINT16', 'H'),
    5: ('miINT32', 'i'), 6: ('miUINT32', 'I'), 7: ('miSINGLE', 'f'), 9: ('miDOUBLE', 'd'),
    12: ('miINT64', 'q'), 13: ('miUINT64', 'Q'),
}
MX_CLASSES = {1: 'cell', 2: 'struct', 3: 'object', 4: 'char', 6: 'double', 7: 'single',
              8: 'int8', 9: 'uint8', 10: 'int16', 11: 'uint16', 12: 'int32', 13: 'uint32'}


def read_element(data, pos):
    """Reads one MAT5 data element starting at pos. Returns (parsed, next_pos)."""
    dtype, size = struct.unpack_from('<II', data, pos)
    small_format = dtype >> 16
    if small_format != 0:
        # small data element format: type+size packed in first 4 bytes, data in next 4
        dtype = dtype & 0xFFFF
        size = small_format
        payload = data[pos + 4: pos + 4 + size]
        next_pos = pos + 8
        return decode_payload(dtype, payload), next_pos

    payload_start = pos + 8
    payload = data[payload_start: payload_start + size]
    padded_size = (size + 7) // 8 * 8
    next_pos = payload_start + padded_size
    return decode_payload(dtype, payload), next_pos


def decode_payload(dtype, payload):
    if dtype == 14:  # miMATRIX
        return parse_matrix(payload)
    if dtype in MI_TYPES:
        name, fmt = MI_TYPES[dtype]
        count = len(payload) // struct.calcsize(fmt)
        vals = struct.unpack_from('<' + fmt * count, payload)
        return {'mi_type': name, 'values': vals, 'raw': payload}
    if dtype == 16:  # miUTF8
        return {'mi_type': 'miUTF8', 'values': list(payload), 'raw': payload}
    if dtype == 17:  # miUTF16
        count = len(payload) // 2
        vals = struct.unpack_from('<' + 'H' * count, payload)
        return {'mi_type': 'miUTF16', 'values': vals, 'raw': payload}
    return {'mi_type': f'unknown({dtype})', 'values': [], 'raw': payload}


def parse_matrix(payload):
    pos = 0
    flags, pos = read_element(payload, pos)
    dims, pos = read_element(payload, pos)
    name, pos = read_element(payload, pos)
    array_class = flags['values'][0] & 0xFF
    class_name = MX_CLASSES.get(array_class, str(array_class))

    result = {'class': class_name, 'dims': dims.get('values') if isinstance(dims, dict) else dims}

    if class_name == 'char':
        data_el, pos = read_element(payload, pos)
        chars = data_el['values']
        result['string'] = ''.join(chr(c) for c in chars)
    elif array_class not in (1, 2, 3):  # not cell/struct/object -> numeric
        data_el, pos = read_element(payload, pos)
        result['values'] = data_el['values']

    return result


def main():
    m = sio.loadmat('C:/Users/Asus/Downloads/drNet.mat', struct_as_record=False, squeeze_me=True)
    fw = m['__function_workspace__']
    data = fw.tobytes()

    zscore_idx = data.find(b'zscore')
    print('zscore string at offset', zscore_idx)

    # the char element for 'zscore' starts at (some tag offset before the string).
    # walk backward to find the miMATRIX tag (14) immediately preceding this element.
    # simplest robust approach: scan forward from a point just after the "Type" field name
    # occurrence, re-reading elements sequentially until we've decoded 'zscore', then
    # continue reading the next two matrices (ImageSize, then Mean).
    # We locate the miMATRIX tag by searching backwards for the pattern:
    # 0e 00 00 00 <size:4 bytes> where size roughly matches distance to end-of-string+pad.
    search_start = max(0, zscore_idx - 64)
    tag_pos = data.rfind(b'\x0e\x00\x00\x00', search_start, zscore_idx)
    print('miMATRIX tag for zscore element at', tag_pos)

    pos = tag_pos
    zscore_el, pos = read_element(data, pos)
    print('Type element ->', zscore_el)

    imagesize_el, pos = read_element(data, pos)
    print('Next element (expected ImageSize) ->', imagesize_el)

    mean_el, pos = read_element(data, pos)
    print('Next element (expected Mean) ->', mean_el)

    std_el, pos = read_element(data, pos)
    print('Next element (expected Std) ->', std_el)


if __name__ == '__main__':
    main()
