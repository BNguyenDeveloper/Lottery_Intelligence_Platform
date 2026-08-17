# LotoAI

LotoAI is a backend-only TypeScript platform for collecting, storing, and analyzing Vietnamese lottery results. Phase 1 focuses on daily data collection, MongoDB Atlas storage, statistics-ready schema design, command-line jobs, and GitHub Actions automation.

This phase does not include AI prediction, machine learning, deep learning, frontend UI, mobile apps, or betting logic.

## Database Architecture

LotoAI stores raw draw results and normalized number rows separately, with physical collections split by region:

- `lottery_results_mien_bac` preserves original northern results.
- `lottery_results_mien_trung` preserves original central results.
- `lottery_results_mien_nam` preserves original southern results.
- `lottery_numbers_mien_bac` expands northern prize numbers into statistics-friendly rows.
- `lottery_numbers_mien_trung` expands central prize numbers into statistics-friendly rows.
- `lottery_numbers_mien_nam` expands southern prize numbers into statistics-friendly rows.

After each result is saved, normalized rows for the same `date + province` are deleted and rebuilt so both collections stay synchronized.

## Collection Design

### lottery_results_mien_bac / lottery_results_mien_trung / lottery_results_mien_nam

```json
{
  "date": "2026-06-19",
  "region": "mien-bac",
  "province": "xsmb",
  "stationName": "Mien Bac",
  "results": {
    "db": ["63155"],
    "g1": ["42245"],
    "g2": ["17963", "84785"],
    "g3": [],
    "g4": [],
    "g5": [],
    "g6": [],
    "g7": [],
    "g8": []
  },
  "source": "xskt",
  "sourceUrl": "https://xskt.net/xsmb/19-06-2026"
}
```

Indexes:

- `{ date: 1, province: 1 }` unique
- `{ date: 1 }`
- `{ region: 1 }`
- `{ province: 1 }`

### lottery_numbers_mien_bac / lottery_numbers_mien_trung / lottery_numbers_mien_nam

```json
{
  "date": "2026-06-19",
  "region": "mien-bac",
  "province": "xsmb",
  "stationName": "Mien Bac",
  "prize": "db",
  "position": 1,
  "fullNumber": "63155",
  "last2": "55",
  "last3": "155",
  "head": "5",
  "tail": "5",
  "sourceResultId": "..."
}
```

Indexes:

- `{ last2: 1 }`
- `{ last3: 1 }`
- `{ date: 1 }`
- `{ region: 1 }`
- `{ province: 1 }`
- `{ region: 1, last2: 1 }`
- `{ province: 1, last2: 1 }`
- `{ date: 1, region: 1 }`
- `{ date: 1, province: 1 }`

## Why lottery_numbers Exists

The raw result document is ideal for auditability, but statistics usually need flattened rows. The `lottery_numbers_*` collections allow fast frequency queries such as top `last2`, top `last3`, regional counts, province counts, and date-window analysis while preserving leading zeros.

Example:

```text
fullNumber = 03004
last2 = 04
last3 = 004
head = 0
tail = 4
```

## Setup

```bash
npm install
cp .env.example .env
npm run build
```

Update `.env` with your MongoDB Atlas credentials. Do not commit `.env`.

## MongoDB Atlas Setup

1. Create or use an Atlas cluster.
2. Create a database user with read/write access.
3. Allow your runner IP address or GitHub Actions access strategy.
4. Put the connection string in `MONGODB_URI`.
5. Ensure the URI targets database `loto_ai`.

## Environment Variables

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.o2zrfpm.mongodb.net/loto_ai?retryWrites=true&w=majority&appName=Cluster0
LOTTERY_SOURCE_BASE_URL=https://xskt.com.vn
XSMB_DAILY_URL_TEMPLATE=https://xoso.com.vn/xsmb-{dd}-{mm}-{yyyy}.html
LOTTERY_FETCH_TIMEOUT_MS=25000
```

Required variables are validated on startup.

## Run Commands

```bash
npm run job:daily
npm run job:date -- 2026-06-19
npm run job:mien-bac
npm run job:mien-trung
npm run job:mien-nam
npm run job:region -- mien-nam
npm run job:region -- mien-nam 2026-06-19
npm run job:province -- vinh-long 2026-06-19
npm run import:xsmb:200 -- 200 2026-06-19
npm run import:xsmn:200 -- 200 2026-06-19
npm run import:xsmt:200 -- 200 2026-06-19
npm run stats:last2 -- --region mien-bac --days 30 --limit 10
npm run stats:last3 -- --province xsmb --days 30 --limit 10
npm run predict:special-last3:mien-trung -- --target-date 2026-08-18 --history-days 1825
npm run backtest:special-last3:mien-trung -- --province phu-yen --test-draws 26 --history-days 1825
npm run predict:da-so:mien-bac -- --history-days 365 --number-top 5 --candidate-pool 20 --pair-top 10
npm run backtest:da-so:mien-bac -- --history-days 365 --test-days 60 --pair-top 10
npm run evaluate:da-so:mien-bac -- 2026-08-13
npm run learn:da-so:mien-bac -- --history-days 365 --backtest-days 60 --learning-rate 0.25
```

The Mien Bac `last2` da-so command selects five numbers jointly and ranks their ten unordered pairs. Its transparent ranking formula combines individual Bayesian/soi-cau strength (40%), Bayesian-smoothed long-term co-occurrence (35%), recent 30-draw co-occurrence (15%), and association lift (10%). This is a ranking score, not a guaranteed win probability. Use the walk-forward backtest and random baseline before changing production settings.

The Mien Trung special-last3 command predicts exactly one `000-999` number for each province scheduled on the target date. Its label is only the final three digits of `results.db[0]`; other prizes are excluded. The isolated hierarchical Bayesian score is `40% regional + 35% province + 15% multi-window trend + 10% digit transition`. Predictions are versioned in `mien_trung_special_last3_prediction_snapshots` and are included as a separate `Special Last3 - One Number` section in the existing scheduled Mien Trung email. Use the walk-forward backtest before relying on it; a random Top-1 baseline is `0.1%` per draw and historical ranking scores are not guaranteed probabilities.

The normal prediction job saves a versioned da-so snapshot for the target date. After results are imported, `job:post-result:mien-bac` evaluates whether both numbers in each pair occurred, saves hit pairs and random-baseline metrics, then runs slow weight learning. Learning uses a 60-day walk-forward grid and moves only 25% toward the best weight set. After at least 14 live evaluations, updates are blocked whenever live average pair hits fall below the corresponding random baseline. Da-so snapshots, evaluations, and weights use separate MongoDB collections so they do not mix with Prediction or Blend history.

## GitHub Actions Setup

The workflow lives at `.github/workflows/daily-lottery-job.yml`.

Required secret:

- `MONGODB_URI`

Optional repository variables:

- `LOTTERY_SOURCE_BASE_URL`
- `XSMB_DAILY_URL_TEMPLATE`
- `LOTTERY_FETCH_TIMEOUT_MS`

The regional import workflow runs daily at `45 11 * * *` (18:45 Vietnam time). The Mien Bac and Mien Trung prediction workflows run daily at `0 13 * * *` (20:00 Vietnam time) and predict the next Vietnam calendar date by default; manual `--target-date`/workflow input still overrides that date.

## Crawler Architecture

Crawler logic implements `LotteryCrawler` and is separate from persistence. The first implementation uses Axios and Cheerio. It can be replaced later without changing repositories or database synchronization.

## Future Roadmap

Phase 2:

- Statistics Dashboard
- REST API

Phase 3:

- Frequency Analysis
- Markov Chain

Phase 4:

- XGBoost
- Random Forest

Phase 5:

- LSTM
- Transformer

## Assumptions and TODOs

- The XSMB URL template is explicit and implemented directly.
- Other province URLs are built from `LOTTERY_SOURCE_BASE_URL`, the province source path, and `dd-mm-yyyy`; confirm exact source paths during production hardening.
- The parser is intentionally replaceable because public lottery HTML can change.
- Add integration tests with recorded HTML fixtures before relying on unattended production crawling.
