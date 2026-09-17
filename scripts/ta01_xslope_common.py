"""Geometría poligonal común para experimentos XSLOPE de TA-01."""


def build_geometry(model):
    from shapely.geometry import LineString, Polygon

    surface = [tuple(point) for point in model["geometry"]["surface"]]
    base = model["geometry"]["baseElevationM"]
    depths = (0, model["geometry"]["soilDepthM"], model["geometry"]["weatheredDepthM"])
    bands = []
    for index, top_depth in enumerate(depths):
        upper = [(x, y - top_depth) for x, y in surface]
        lower = ([(x, y - depths[index + 1]) for x, y in surface]
                 if index + 1 < len(depths) else [(x, base) for x, _ in surface])
        polygon = Polygon(upper + list(reversed(lower)))
        if not polygon.is_valid or polygon.area <= 0:
            raise ValueError(f"Zona de material {index} inválida")
        bands.append(polygon)
    domain = Polygon(surface + [(surface[-1][0], base), (surface[0][0], base)])
    if not domain.is_valid or not domain.equals(bands[0].union(bands[1]).union(bands[2])):
        raise ValueError("Las zonas no particionan el dominio TA-01")
    return surface, domain, bands, LineString(surface)


def require_transient_balance(solution, maximum_closure=0.05):
    """No acredita un campo hidráulico solo por la convergencia algebraica."""
    from math import isfinite

    if not solution.get("converged") or solution.get("cancelled"):
        raise RuntimeError("La filtración transitoria no convergió en todos los pasos")
    balance = solution["mass_balance"]
    closure = float(balance["final_closure"])
    inflow = float(balance["cumulative_inflow"])
    stored = float(balance["final_stored_change"])
    scale = max(abs(inflow), abs(stored))
    direct_closure = 0.0 if scale < 1e-8 else abs(stored - inflow) / scale
    if not isfinite(closure) or not isfinite(direct_closure) or max(closure, direct_closure) > maximum_closure:
        raise RuntimeError(
            "El cierre de masa transitorio supera 5%: "
            f"fracción solver={closure:.4g}, fracción directa={direct_closure:.4g}, "
            f"ingreso neto={inflow:.4g} m², cambio almacenado={stored:.4g} m²"
        )
    return balance
