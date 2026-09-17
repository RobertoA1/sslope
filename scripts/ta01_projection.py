"""Interpolación conservadora de geometría (no de masa) tri3 hidráulica→nodos tri6."""

from collections import Counter

import matplotlib.tri as mtri
import numpy as np


def projected_delta(field, target_nodes, hour):
    source_nodes = np.asarray(field["nodesM"], dtype=float)
    triangles = np.asarray(field["triangles"], dtype=int)
    values = np.asarray(field[f"deltaHead{hour}hM"], dtype=float)
    if len(values) != len(source_nodes):
        raise ValueError("El campo nodal hidráulico no coincide con su malla")
    triangulation = mtri.Triangulation(source_nodes[:, 0], source_nodes[:, 1], triangles)
    interpolated = mtri.LinearTriInterpolator(triangulation, values)(target_nodes[:, 0], target_nodes[:, 1])
    result = np.asarray(np.ma.filled(interpolated, np.nan), dtype=float)
    missing = ~np.isfinite(result)
    maximum_boundary_residual = 0.0
    if np.any(missing):
        edge_count = Counter(tuple(sorted(edge)) for tri in triangles for edge in
                             ((int(tri[0]), int(tri[1])), (int(tri[1]), int(tri[2])), (int(tri[2]), int(tri[0]))))
        boundary_edges = np.asarray([edge for edge, count in edge_count.items() if count == 1], dtype=int)
        start, end = source_nodes[boundary_edges[:, 0]], source_nodes[boundary_edges[:, 1]]
        direction = end - start
        length_squared = np.sum(direction ** 2, axis=1)
        for index in np.flatnonzero(missing):
            point = target_nodes[index]
            along = np.clip(np.sum((point - start) * direction, axis=1) / length_squared, 0, 1)
            residual = np.linalg.norm(point - (start + along[:, None] * direction), axis=1)
            nearest = int(np.argmin(residual))
            maximum_boundary_residual = max(maximum_boundary_residual, float(residual[nearest]))
            if residual[nearest] > 1e-5:
                raise ValueError(f"Nodo mecánico {index} no cae en la malla hidráulica: {residual[nearest]:.3g} m")
            a, b = boundary_edges[nearest]
            result[index] = (1 - along[nearest]) * values[a] + along[nearest] * values[b]
    return result, {"boundaryInterpolationNodeCount": int(np.count_nonzero(missing)),
                    "maximumBoundaryResidualM": maximum_boundary_residual}
