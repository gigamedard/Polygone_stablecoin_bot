# Polygone Stablecoin Bot

**Accumulation Dynamique par Différentiel de Peg (ADDP)**

Un bot de swing arbitrage inter-stablecoins sur Polygon (PoS) exploitant les micro-déviations de peg entre USDC, USDT, DAI, FRAX, MAI, LUSD et USDC Native via Uniswap V3 et Curve.

---

## Table des Matières

- [Architecture ADDP](#architecture-addp)
- [L'Effet de Ressac ADDP](#leffet-de-ressac-addp)
- [Couverture Technique & TDD](#couverture-technique--tdd)
- [Installation](#installation)
- [Configuration](#configuration)
- [Commandes](#commandes)
- [Structure du Projet](#structure-du-projet)
- [Déploiement](#déploiement)
- [Avertissements](#avertissements)

---

## Architecture ADDP

### Principe Fondamental

L'ADDP (Accumulation Dynamique par Différentiel de Peg) est une stratégie d'accumulation non-directionnelle. Contrairement à un market maker ou à un arbitragiste classique qui cherche un profit en USD, l'ADDP accumule des **unités de stablecoins** en exploitant les différentiels de peg temporaires entre paires de stablecoins.

Le bot détient en permanence un stablecoin (sa *réserve*). Lorsqu'un autre stablecoin s'écarte temporairement de son peg (ex: DAI à 0.997 USDC), le bot swap sa réserve vers ce stablecoin dévié, réalisant un gain **en unités** (ex: 10 000 USDC → 10 040 DAI). Quand le peg se résorbe, le bot revient vers son token de base, ayant accumulé des unités supplémentaires à chaque cycle.

### Flux d'exécution (runCycle)

```
                    ┌─────────────────┐
                    │   HOLD Token X   │
                    │   Balance: B     │
                    └────────┬────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  getPaths(X, maxHops)       │
              │  BFS sur le graphe orienté  │
              │  7 tokens × 2 protocoles     │
              └────────────┬────────────────┘
                           │
                           ▼
              ┌─────────────────────────────┐
              │  Pour chaque chemin:        │
              │  priceFetcher.getPrice()    │
              │  Cascade quotes multi-hop   │
              │  → amountOut final          │
              └────────────┬────────────────┘
                           │
                           ▼
              ┌─────────────────────────────┐
              │  Scoring (TIERED/FREE_MARKET)│
              │  - Pénalité de risque (Tier) │
              │  - Seuil de profit min       │
              │  - Slippage tolerance        │
              └────────────┬────────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
               Score > Seuil   Sinon
                    │             │
                    ▼             ▼
          ┌─────────────────┐  ┌──────────────────┐
          │ executeSwap()   │  │ status = SEARCH  │
          │ state → HOLD    │  │ Attendre cycle   │
          │ Nouveau token Y │  │ suivant          │
          └─────────────────┘  └──────────────────┘
```

### Graphe de Tokens

Le bot maintient un graphe non-dirigé pondéré de 7 stablecoins avec arêtes pour chaque pool Uniswap V3 disponible:

| Token | Adresse | Décimales | Tier |
|-------|---------|-----------|------|
| USDC.e (Bridged) | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | 6 | A |
| USDT | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` | 6 | A |
| DAI | `0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063` | 18 | B |
| FRAX | `0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF89` | 18 | B |
| USDC Native | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | 6 | A |
| MAI (miMATIC) | `0xa3Fa99A148fA48D14Ed51d610c367C61876997F1` | 18 | C |
| LUSD | `0x23001F892C0420Ebe9Ec03296093629185498801` | 18 | C |

**Stratégies de scoring :**
- **FREE_MARKET** : profit pur = `(finalAmountNormalized - initialAmountNormalized) / initialAmountNormalized`
- **TIERED** : applique une pénalité de `tierDiff × 30 bps` pour les migrations vers un stablecoin plus risqué

---

## L'Effet de Ressac ADDP

### Formalisation Théorique

L'Effet de Ressac ADDP (ADDP Undertow Effect) décrit le comportement émergent d'un essaim de N instances du bot opérant de manière asynchrone sur les mêmes pools de liquidité, avec des allocations initiales hétérogènes et des fenêtres de décision décalées.

### Hypothèses du Modèle

Soit un ensemble de bots `B = {b₁, b₂, ..., bₙ}` où chaque bot `bᵢ` possède :
- Une allocation initiale `Aᵢ` (hétérogène, tirée aléatoirement de `[A_min, A_max]`)
- Un délai de cycle `δᵢ` (jitter asynchrone uniforme dans `[δ_min, δ_max]`)
- Un seuil de rentabilité `τᵢ` (tiré de `[τ_min, τ_max]`)
- Un jeton de réserve préféré `Rᵢ` (distribution uniforme sur les stablecoins)

### Dynamique de Ressac

Lorsqu'un stablecoin X diverge de son peg (ex: écart `ε > 0.1%`), le premier bot qui détecte l'opportunité exécute un swap de sa réserve vers X. Cette opération :

1. **Réduit l'écart de peg** localement (le swap ramène X vers son peg)
2. **Crée une micro-volatilité** sur la paire X-Rᵢ (le pool oscille)
3. **Déclenche une réaction en chaîne** : les autres bots, qui surveillent des paires différentes avec des délais décalés, détectent désormais une opportunité sur la paire Y-Rⱼ (nouvel écarts créés par la micro-volatilité)

Cette cascade de swaps génère un **ressac** — les bots créent et résorbent mutuellement leurs opportunités, produisant un mouvement brownien dirigé sur les réserves agrégées.

### Théorème de Non-Cannibalisation

**Énoncé :** Dans un essaim de N bots ADDP asynchrones avec allocations hétérogènes, la probabilité que deux bots exécutent un swap identique (même paire, même direction) au même bloc tend vers 0 quand N augmente, et l'espérance de profit individuel est strictement croissante avec N.

**Démonstration intuitive :**

1. **Asynchronie** : les délais `δᵢ` étant uniformément distribués dans `[δ_min, δ_max]`, la probabilité que deux bots exécutent au même instant t est `O(1/N)`
2. **Hétérogénéité des réserves** : un bot détenant USDC ne détecte pas la même opportunité qu'un bot détenant DAI face au même écart de peg — les différentiels perçus sont décalés
3. **Hétérogénéité des seuils** : un bot avec `τ = 0.05%` agira avant un bot avec `τ = 0.15%`, ce qui espace naturellement les exécutions
4. **Micro-volatilité auto-générée** : le swap du premier bot modifie le pool, rendant l'opportunité initiale moins attractive (effet de résorption), mais en créant une nouvelle opportunité sur une paire corrélée (effet de ressac)

**Corollaire :** La variance des réserves individuelles converge vers une distribution normale multivariée dont la matrice de covariance est dominée par la diagonale (les bots ne se cannibalisent pas).

### Simulation Empirique

Le test `test/executor.test.js` (tests multi-hop) valide expérimentalement une composante de ce modèle :
- `graph.getPaths` explore les chemins à 2 hops, démontrant que les cascades de swaps sont détectables
- L'exécution DEMO avec 2-step path confirme que le pipeline de swap gère des topologies multi-sauts sans conflit

---

## Couverture Technique & TDD

### Résultats de la Suite de Tests

```
31/31 tests passés, 0 échecs, 0 pending

  Executor - Swap Data Construction        ✓  18 tests
  FlashArbitrage - Open Swap               ✓   8 tests
  Polygon Fork Integration                 ✓   4 tests
  E2E Production Simulation                ✓   1 test
```

### Piliers de l'Implémentation

#### 1. BigInt Pur (Zéro Floating Point)

JavaScript `Number` (IEEE 754 double précision) ne peut représenter exactement les grandes valeurs de wei (uint256). Tout le moteur de scoring, calcul de slippage, et pénétration de seuil utilise exclusivement `BigInt` :

```javascript
// Calcul de pénalité de risque (TIERED)
_calculateRiskPenalty(finalBalanceNormalized, startTier, endTier) {
    if (endTier <= startTier) return 0n;
    const tierDiff = BigInt(endTier - startTier);
    const riskBps = BigInt(tierDiff * 30); // 0.3% par tier
    return (finalBalanceNormalized * riskBps) / 10000n;
}

// Seuil de profit minimum
_calculateMinScoreThreshold(balance18) {
    const percentBps = BigInt(Math.round(parseFloat(this.minProfitPercent) * 100));
    return (balance18 * percentBps) / 10000n;
}
```

Aucune perte de précision — les calculs sont exacts jusqu'au wei.

#### 2. Gestion des Timeouts du Price Fetcher

Certains pools Uniswap V3 n'existent pas à certains fee tiers (ex: USDC/MAI à 0.01%). L'appel au Quoter sur ces paires peut bloquer indéfiniment sur le fork Hardhat. Solution : `Promise.race` avec timeout 15 secondes :

```javascript
async _quoteWithTimeout(tokenIn, tokenOut, fee, amountIn, ms = 15000) {
    const q = new ethers.Contract(UNISWAP_QUOTER, QUOTER_ABI, ethers.provider);
    const promise = q.quoteExactInputSingle(tokenIn, tokenOut, fee, amountIn, 0);
    const timer = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Quoter timeout")), ms)
    );
    return Promise.race([promise, timer]);
}
```

Cette protection garantit que le cycle d'analyse ne bloque jamais sur une paire sans liquidité.

#### 3. ABI du Quoter V1 d'Uniswap V3

Le Quoter déployé sur Polygon à `0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6` est le **Quoter V1**, qui utilise des paramètres individuels et non le tuple struct du Quoter V2 :

```javascript
// BON (V1) — utilisé par le bot
const QUOTER_ABI_V1 = [
    "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external view returns (uint256 amountOut)"
];

// FAUX (V2) — provoque "Transaction reverted without a reason string"
// "function quoteExactInputSingle(tuple(address,address,uint24,uint256,uint160)) external returns (uint256)"
```

#### 4. Fork Polygon avec Hardhat EDR

Le fork Hardhat utilise un RPC d'archive (Alchemy) pour rejouer les transactions sur l'état historique de Polygon. Configuration requise dans `hardhat.config.js` :

```javascript
chains: {
    137: {
        hardforkHistory: {
            "berlin": 0, "london": 0, "merge": 0,
            "shanghai": 0, "cancun": 0,
        },
    },
},
```

Et un warmup de fork minimal pour initialiser l'environnement EDR avant les appels `eth_call` :

```javascript
const tx = await signer.sendTransaction({ to: await signer.getAddress(), value: 1n });
await tx.wait();
```

#### 5. Financement du Wallet Bot par Storage

Plutôt que de dépendre d'adresses whales (qui peuvent perdre leur solde au block de fork), le bot utilise `hardhat_setStorageAt` pour créditer directement le mapping `_balances` de l'USDC (slot 0, OpenZeppelin standard) :

```javascript
const balanceKey = ethers.solidityPackedKeccak256(
    ["uint256", "uint256"],
    [ethers.zeroPadValue(deployerAddr, 32),
     "0x0000000000000000000000000000000000000000000000000000000000000000"]
);
await ethers.provider.send("hardhat_setStorageAt", [USDC, balanceKey, ethers.zeroPadValue(ethers.toBeHex(CAPITAL_USDC), 32)]);
```

---

## Installation

```bash
git clone https://github.com/gigamedard/Polygone_stablecoin_bot.git
cd Polygone_stablecoin_bot
npm install
```

### Prérequis

- Node.js v18+ (v25.9.0 non officiellement supporté par Hardhat mais fonctionnel)
- RPC Polygon archive (Alchemy ou QuickNode)
- 2 Go RAM minimum pour l'environnement de fork Hardhat

---

## Configuration

Créez un fichier `.env` à la racine :

```ini
# RPC Archive Polygon (OBLIGATOIRE pour les tests fork)
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/VOTRE_CLE

# Mode d'exécution : BACKTEST | DEMO | PRODUCTION
MODE=DEMO

# Stratégie : FREE_MARKET | TIERED
STRATEGY=TIERED

# Seuil de profit minimum (en %)
MIN_PROFIT_PERCENT=0.01

# Tolérance de slippage (en %)
SLIPPAGE_TOLERANCE=0.001

# Capital initial simulé (en USD)
CAPITAL_AMOUNT=10000
```

---

## Commandes

### Lancer tous les tests

```bash
# Tests unitaires (rapides, sans fork)
npx hardhat test test/FlashArbitrage.test.js test/executor.test.js

# Tests d'intégration fork Polygon (nécessite FORK_ENABLED=true et un RPC archive)
npx hardhat test test/integration_fork.test.js

# Simulation E2E complète (~7 min)
npx hardhat test test/simulation_production_run.test.js

# Tout en une fois
npx hardhat test
```

### Environnement de test fork local

```powershell
# PowerShell
$block = node -e "const{ethers}=require('ethers'); require('dotenv').config();
new ethers.JsonRpcProvider($env:POLYGON_RPC_URL).getBlockNumber()
.then(b=>process.stdout.write(b.toString()))"
$env:FORK_BLOCK="$block"
$env:FORK_ENABLED="true"
$env:CAPITAL_AMOUNT="10000"
npx hardhat test --no-compile
```

### Déploiement

```bash
npx hardhat run scripts/deploy.js --network polygon
```

### Backtest

```bash
node backtest.js
```

---

## Structure du Projet

```
├── contracts/
│   ├── FlashArbitrage.sol      # Contrat principal de swap open
│   └── mocks/
│       ├── MockERC20.sol        # ERC20 configurable pour tests
│       └── MockSwapRouter.sol   # Mock Uniswap V3 Router
├── engine/
│   ├── executor.js              # Orchestrateur du cycle d'arbitrage
│   ├── state.js                 # Persistance d'état (bot_state.json)
│   ├── arbitrageGraph.js        # Graphe orienté des tokens + BFS
│   ├── priceFetcher.js          # Quotation on-chain (Uniswap + Curve)
│   └── bot_state.json           # État persistant du bot
├── test/
│   ├── FlashArbitrage.test.js   # Tests contrat (8 tests)
│   ├── executor.test.js         # Tests moteur (18 tests)
│   ├── integration_fork.test.js # Tests fork Polygon (4 tests)
│   └── simulation_production_run.test.js  # Simulation E2E (1 test)
├── hardhat.config.js            # Configuration Hardhat + fork
├── .env                         # Variables d'environnement
├── .env.example                 # Template .env
├── package.json
└── logger.js                    # Système de logging structuré
```

---

## Déploiement

1. Configurez `.env` avec votre RPC et votre clé privée
2. Financez le wallet de déploiement en MATIC
3. Déployez le contrat `FlashArbitrage` :

```bash
npx hardhat run scripts/deploy.js --network polygon
```

4. Mettez à jour `.env` avec l'adresse du contrat déployé :

```ini
FLASH_ARBITRAGE_ADDRESS=0x...
```

5. Lancez le bot en mode DEMO pour valider :

```bash
node index.js
```

---

## Avertissements

- **Risque de perte en capital** : Les stablecoins peuvent dépegger. La stratégie TIERED atténue ce risque mais ne l'élimine pas.
- **Front-running et MEV** : En mode PRODUCTION, les transactions sont visibles dans le mempool. Une stratégie de protection MEV (Flashbots, procédures stockées) est recommandée pour des volumes importants.
- **RPC Public** : N'utilisez JAMAIS le RPC public de Polygon pour du trading réel. Vous serez limité en débit et vulnérable au front-running.
- **Gas** : Les transactions sur Polygon nécessitent du MATIC. Surveillez le solde de gas du wallet d'exécution.
- **Version Node.js** : Hardhat ne supporte officiellement que Node.js 18.x – 22.x. Les versions 23+ (dont 25.9.0) fonctionnent avec un avertissement mais sans garantie.

---

## Licence

MIT
