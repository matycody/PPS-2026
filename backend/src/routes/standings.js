const express = require('express');
const { computeStandings } = require('../services/standings');

const router = express.Router();

// Tabla de posiciones (pública). Filtro opcional: stageId
router.get('/:id/standings', async (req, res) => {
  try {
    const stageId = req.query.stageId ? String(req.query.stageId) : null;
    const data = await computeStandings(req.params.id, stageId);
    if (!data) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (stageId && !data.stages.length) return res.status(404).json({ error: 'Zona no encontrada' });
    res.json(data);
  } catch (err) {
    console.error('[standings]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;