"""
Sanity check: run the converted TF SavedModel (NHWC) on the same
preprocessed image as onnx_baseline.py (NCHW ONNX) and compare outputs.
If onnx2tf did its job, these should match to within float rounding.
"""
import numpy as np
from PIL import Image
import tensorflow as tf

MEAN = np.array([103.22674560546875, 55.19105911254883, 18.386537551879883], dtype=np.float32)
STD = np.array([70.68042755126953, 38.57248306274414, 20.664936065673828], dtype=np.float32)
CLASS_ORDER = ['Mild', 'Moderate', 'No_DR', 'Proliferate_DR', 'Severe']
CLASS_TO_GRADE = {'No_DR': 0, 'Mild': 1, 'Moderate': 2, 'Severe': 3, 'Proliferate_DR': 4}


def preprocess_nhwc(image_path):
    img = Image.open(image_path).convert('RGB').resize((224, 224), Image.BILINEAR)
    arr = np.array(img).astype(np.float32)  # HWC, RGB, 0-255
    arr = (arr - MEAN) / STD
    arr = np.expand_dims(arr, 0)  # NHWC
    return arr.astype(np.float32)


def main(image_path):
    model = tf.saved_model.load('saved_model_dr')
    infer = model.signatures['serving_default']
    print('Signature inputs:', infer.structured_input_signature)
    print('Signature outputs:', infer.structured_outputs)

    x = preprocess_nhwc(image_path)
    out = infer(tf.constant(x))
    key = list(out.keys())[0]
    probs = out[key].numpy()[0]

    print()
    print(f'Raw output sum: {probs.sum():.6f}')
    print('--- Per-class probabilities (output index order) ---')
    for i, cls in enumerate(CLASS_ORDER):
        grade = CLASS_TO_GRADE[cls]
        print(f'  index {i}: {cls:15s} (grade {grade})  ->  {probs[i]*100:6.2f}%')

    top_idx = int(np.argmax(probs))
    top_cls = CLASS_ORDER[top_idx]
    print()
    print(f'Predicted: index {top_idx} = {top_cls} (grade {CLASS_TO_GRADE[top_cls]}), confidence {probs[top_idx]*100:.2f}%')


if __name__ == '__main__':
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else 'sample_fundus_synthetic.png'
    main(path)
