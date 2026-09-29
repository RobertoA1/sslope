"""Inference helper for trusted exported artifacts. Input features are raw units."""
from pathlib import Path
import json
import numpy as np


def forecast(folder, model, windows, current_mm):
    folder = Path(folder)
    x = np.asarray(windows, dtype=np.float32)
    current = np.asarray(current_mm, dtype=float)
    if model in {"dense", "lstm", "gru"}:
        import keras
        meta = json.loads((folder/f"{model}-preprocessing.json").read_text())
        if x.ndim != 3 or x.shape[1:] != (meta["lookback"], len(meta["features"])):
            raise ValueError("La forma/ventana no coincide con el contrato de preprocesamiento")
        net = keras.models.load_model(folder/f"{model}.h5", compile=False)
        normalized = (x-np.asarray(meta["input_mean"]))/np.asarray(meta["input_scale"])
        delta = net(normalized.astype(np.float32), training=False).numpy().reshape(-1)
        return current + delta*meta["target_scale"]+meta["target_mean"]
    import joblib
    bundle = joblib.load(folder/f"{model}.joblib")
    if x.ndim != 3 or x.shape[1:] != (bundle["lookback"], len(bundle["features"])):
        raise ValueError("La forma/ventana no coincide con el artefacto")
    normalized = bundle["scaler"].transform(x.reshape(-1, x.shape[-1])).reshape(len(x), -1)
    return current + bundle["model"].predict(normalized)*bundle["scale"]+bundle["mean"]
