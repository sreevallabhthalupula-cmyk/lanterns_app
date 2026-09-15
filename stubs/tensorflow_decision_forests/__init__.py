# Harmless stub. The real `tensorflow_decision_forests` package has no
# Windows wheel and fails to build from source here. tensorflowjs's
# converter only imports this module for its custom-op registration
# side effect and never calls into it directly -- irrelevant for
# converting a plain CNN (ResNet18) with no decision-forest ops.
