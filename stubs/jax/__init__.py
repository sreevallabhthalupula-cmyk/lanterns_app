# Harmless stub -- real `jax` is a heavy, unneeded dependency for the
# tf_saved_model -> tfjs_graph_model conversion path we use. Both
# tensorflowjs (JAX conversion feature) and Keras 3's optional orbax
# integration probe `jax.monitoring.record_scalar` at import time even
# though we never invoke either feature. Only the specific attribute
# actually touched is defined -- no catch-all __getattr__, since that
# breaks Python's `inspect` module (which relies on normal AttributeError
# behavior for absent dunder attributes like __file__/__spec__).
from . import monitoring
