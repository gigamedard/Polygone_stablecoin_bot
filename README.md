# 🤖 Polygon Stablecoin Arbitrage Bot

Ce bot détecte et exécute des opportunités d'arbitrage de stablecoins sur la blockchain Polygon (Mainnet). Il utilise une stratégie "Greedy" optimisée pour minimiser les appels RPC tout en maximisant les profits via des swaps directs sur Uniswap V3 et Curve.

## 🚀 Prérequis

- **Node.js**: v16+
- **RPC Privé (Obligatoire)** : Alchemy ou Infura (Le RPC public est trop lent/limité).
- **Wallet** : Clé privée avec des fonds en MATIC (pour le Gas) et Stablecoins (USDC/USDT/DAI) si mode PROD.

## 🛠️ Installation

```bash
npm install
```

## ⚙️ Configuration (.env)

Créez un file `.env` à la racine (voir `.env.example`).

```ini
# Connexion Blockchain
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/VOTRE_CLE_API
PRIVATE_KEY=0xVotreCléPrivée

# Modes d'Exécution : BACKTEST | DEMO | PRODUCTION
# - BACKTEST : Simulation rapide sur données mockées.
# - DEMO : Lecture seule sur les VRAIS prix du marché (sans transaction).
# - PRODUCTION : Exécution réelle des swaps (ATTENTION).
MODE=DEMO

# Paramètres de Stratégie
MIN_PROFIT_PERCENT=0.15      # Seuil de déclenchement (0.15% min)
MAX_HOPS=7                   # Profondeur de recherche (Non utilisé en mode Greedy)
CAPITAL_AMOUNT=3000          # Montant simulé en USD
REVERT_THRESHOLD=0.9995      # Seuil de retour au peg (Optionnel)
FORCE_EXIT_HOURS=4          # Durée max de détention avant vente forcée

# Choix de la Stratégie
# - FREE_MARKET : Cherche le profit pur, accepte tous les risques (frais, slippage, depeg).
# - TIERED : Applique des pénalités si on swap vers un stablecoin plus risqué (ex: USDC -> MAI).
# - TIERED : Applique des pénalités si on swap vers un stablecoin plus risqué (ex: USDC -> MAI).
STRATEGY=FREE_MARKET

# Intervalle de scan (en ms)
# 30000 = 30s (Safe). 5000 = 5s (Rapide).
POLLING_INTERVAL=5000
```

## 🚢 Déploiement

Une fois la configuration terminée (et votre wallet financé), déployez le smart contract sur Polygon :

```bash
npx hardhat run scripts/deploy.js --network polygon
```

Le script affichera l'adresse du contrat déployé (ex: `0x...`). Copiez cette adresse et mettez à jour votre fichier `.env` :

```ini
FLASH_ARBITRAGE_ADDRESS=0xVotreAdresseDeContrat
```

## 🧠 Stratégies Disponibles

### 1. Greedy Direct (Optimisée RPC)
C'est la stratégie par défaut actuelle.
- **Principe** : Analyse uniquement les opportunités de swap **direct** (1 Hop) depuis le token détenu.
- **Avantage** : Extrêmement rapide et économe en requêtes RPC (~6 appels par cycle).
- **Fonctionnement** :
  1. Récupère les prix de `TokenActuel -> [USDC, USDT, DAI, FRAX, MAI, LUSD]`.
  2. Compare le retour sur investissement net (après frais).
  3. Si `Profit > MIN_PROFIT_PERCENT`, exécute le swap.

### 2. Tiered (Sécurisée)
Ajoute une couche de sécurité à la logique Greedy.
- **Tier A** : USDC, USDT
- **Tier B** : DAI, FRAX
- **Tier C** : MAI, LUSD
- **Règle** : Si le bot passe d'un Tier A vers B ou C, une **pénalité virtuelle** est appliquée au score. Il ne fera le trade que si le profit est IMMENSE pour compenser le risque.

## ▶️ Utilisation

### Lancer une Démonstration (Temps Réel)
Scanne le marché réel sans exécuter de transactions. Idéal pour monitorer.
```bash
node demo_analysis.js
```

### Lancer un Backtest (Simulation)
Simule des scénarios de marché pour valider la logique.
```bash
node backtest.js
```

### Tests Unitaires
Vérifie la logique des contrats et du moteur.
```bash
npx hardhat test
```

## ⚠️ Avertissements
- **Risque de Perte** : Le trading de stablecoins comporte des risques (Depeg, Smart Contract bug).
- **RPC** : N'utilisez **JAMAIS** le RPC public pour du trading réel. Vous serez front-run ou rate-limited.
