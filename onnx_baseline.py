"""
Baseline inference on the ORIGINAL drNet.onnx using onnxruntime.
This is the ground truth we compare the TF.js-converted model against
to confirm the conversion pipeline didn't change the numerics.

Preprocessing, decoded directly from drNet.mat's ImageInputLayer:
  - Resize to 224x224, RGB
  - Normalization = 'zscore': (pixel[0-255] - mean) / std, per channel
  - Mean (R,G,B) = [103.22674560546875, 55.19105911254883, 18.386537551879883]
  - Std  (R,G,B) = [70.68042755126953, 38.57248306274414, 20.664936065673828]
  - Input layout: NCHW (data: [batch, 3, 224, 224]) per the ONNX graph input shape
"""
import numpy as np
from PIL import Image
import onnxruntime as ort

MEAN = np.array([103.22674560546875, 55.19105911254883, 18.386537551879883], dtype=np.float32)
STD = np.array([70.68042755126953, 38.57248306274414, 20.664936065673828], dtype=np.float32)

# Class order decoded from drNet.mat's categorical Classes property
# (alphabetical, as MATLAB's imageDatastore produces by default):
CLASS_ORDER = ['Mild', 'Moderate', 'No_DR', 'Proliferate_DR', 'Severe']
CLASS_TO_GRADE = {'No_DR': 0, 'Mild': 1, 'Moderate': 2, 'Severe': 3, 'Proliferate_DR': 4}


def preprocess(image_path):
    img = Image.open(image_path).convert('RGB').resize((224, 224), Image.BILINEAR)
    arr = np.array(img).astype(np.float32)  # HWC, RGB, 0-255
    arr = (arr - MEAN) / STD
    arr = arr.transpose(2, 0, 1)  # HWC -> CHW
    arr = np.expand_dims(arr, 0)  # add batch dim -> NCHW
    return arr.astype(np.float32)


def main(image_path):
    session = ort.InferenceSession('C:/Users/Asus/Downloads/drNet.onnx', providers=['CPUExecutionProvider'])
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    print('ONNX input name:', input_name, session.get_inputs()[0].shape)
    print('ONNX output name:', output_name, session.get_outputs()[0].shape)

    x = preprocess(image_path)
    probs = session.run([output_name], {input_name: x})[0][0]

    print()
    print(f'Raw output shape: {probs.shape}')
    print(f'Raw output sum: {probs.sum():.6f} (should be ~1.0 if already softmax)')
    print()
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
