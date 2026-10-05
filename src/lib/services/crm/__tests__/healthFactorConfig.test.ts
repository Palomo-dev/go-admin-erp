import { DEFAULT_HEALTH_CONFIG, healthFactorConfigSchema } from '../healthFactorConfig';
const draft = () => JSON.parse(JSON.stringify(DEFAULT_HEALTH_CONFIG));
test('config vigente y desactivar factores con redistribución preservan total100', () => {
  expect(healthFactorConfigSchema.safeParse(draft()).success).toBe(true);
  const config = draft(); config.indicators[0].weight = 0; config.indicators[1].weight = 55;
  const parsed = healthFactorConfigSchema.parse(config);
  expect(parsed.indicators[0].weight).toBe(0);
});
test.each(['weights', 'bands', 'unknown', 'duplicate', 'wrong-direction', 'nan', 'extra'])('rechaza configuración inválida: %s', kind => {
  const config = draft();
  if (kind === 'weights') config.indicators[0].weight = 10;
  if (kind === 'bands') config.bands.yellow = config.bands.green;
  if (kind === 'unknown') config.indicators[0].key = 'made_up';
  if (kind === 'duplicate') config.indicators[1].key = config.indicators[0].key;
  if (kind === 'wrong-direction') config.indicators[0].thresholds[0] = { min: 7, score: 100 };
  if (kind === 'nan') config.indicators[0].weight = NaN;
  if (kind === 'extra') config.organization_id = 121;
  expect(healthFactorConfigSchema.safeParse(config).success).toBe(false);
});
