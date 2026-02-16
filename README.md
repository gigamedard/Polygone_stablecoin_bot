# 🤖 Polygon Stablecoin Arbitrage Bot

Ce projet est un bot d'arbitrage automatisé sur la blockchain Polygon, conçu pour générer des profits en exploitant les différences de prix entre stablecoins (USDC, USDT, DAI, FRAX, MAI, LUSD).

## 🚀 Fonctionnalités Clés

*   **Stratégie Greedy** : Recherche des opportunités de profit direct (1 Hop) pour minimiser les frais de Gas et maximiser la vitesse d'exécution.
*   **Gestion des Risques (Tiered Risk)** : Privilégie les stablecoins sûrs (USDC, USDT). Applique des pénalités virtuelles aux opportunités impliquant des tokens plus risqués (MAI, LUSD) pour éviter le "bad debt".
*   **Execution Hybride** : Utilise un Smart Contract dédié (`FlashArbitrage.sol`) pour l'exécution atomique des trades sur Uniswap V3 et Curve (Aave Pool).
*   **Force Exit** : Vend automatiquement toute position détenue depuis plus de 4 heures pour revenir en USDC, évitant le blocage des fonds.
*   **Suivi des Profits** : Calcul en temps réel des gains/pertes par rapport au capital initial.

## 🛠️ Installation

```bash
npm install
```

## ⚙️ Configuration (.env)

Créez un fichier `.env` à la racine :

```ini
# Connexion Blockchain
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/VOTRE_CLE_API
PRIVATE_KEY=0xVotreCléPrivée

# Modes : BACKTEST | DEMO | PRODUCTION
MODE=DEMO

# Stratégie
MIN_PROFIT_PERCENT=0.20      # Profit minimum (0.20%)
MIN_PROFIT_AMOUNT=0          # Profit minimum en valeur absolue (ex: 0.5$)
FORCE_EXIT_HOURS=4           # Durée max de détention avant vente forcée
STRATEGY=TIERED              # ou FREE_MARKET
MAX_HOPS=2                   # (Non utilisé en mode Greedy pur)

# Adresse du Contrat Déployé
FLASH_ARBITRAGE_ADDRESS=0x...
```

## ▶️ Utilisation

### Lancer le Bot (Mode défini dans .env)

Le script principal détectera automatiquement le mode (DEMO ou PRODUCTION) et lancera la boucle d'arbitrage.

```bash
node index.js
```

### Analyse de Marché (Demo)

Pour scanner le marché en temps réel sans exécuter de transactions (toutes les transactions sont simulées) :

```bash
node demo_analysis.js
```

### Backtest

Pour tester la logique sur des données simulées :

```bash
node backtest.js
```

## 🏗️ Architecture

*   **`engine/executor.js`** : Cerveau du bot. Gère la boucle de décision, le calcul des scores et l'envoi des transactions.
*   **`engine/priceFetcher.js`** : Récupère les prix en temps réel depuis les DEX (Uniswap V3 Quoter, Curve Pools).
*   **`contracts/FlashArbitrage.sol`** : Smart Contract Solidity qui exécute les swaps de manière atomique sur la blockchain.

## ⚠️ Avertissement

Ce logiciel est fourni à titre expérimental. Le trading de crypto-monnaies comporte des risques de perte de capital. N'utilisez que des fonds que vous pouvez vous permettre de perdre.
