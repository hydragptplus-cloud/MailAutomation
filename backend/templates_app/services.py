from .editor import apply_layout

def create_or_update_from_layout(instance, layout):
    return apply_layout(instance, layout)
