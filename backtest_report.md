# Rapport de Backtest - Stratégie TIERED & Graph Étendu

**Date** : 10 Février 2026
**Mode** : BACKTEST (Prix Simulés)
**Configuration** :
- **STRATEGY** : `TIERED` (Nouveau)
- **CAPITAL_AMOUNT** : 1000
- **MAX_HOPS** : 4
- **MIN_PROFIT_PERCENT** : 0.20%
- **Tokens** : USDC, USDT, DAI, FRAX, Native USDC, MAI, LUSD

## Résultats Clés

### 1. Fonctionnement de la Stratégie TIERED
Le bot a correctement appliqué les pénalités de risque lors de l'exploration de chemins impliquant des stablecoins de Tiers inférieurs.
- **Preuve (Logs)** : `Path [...] score: -999.99... (Inc. Penalty: -0.000...)`
- Les chemins risqués (ex: vers MAI/LUSD sans profit suffisant) ont été pénalisés et ignorés.

### 2. Expansion du Graph (7 Tokens, 4 Hops)
- Le bot explore désormais un univers beaucoup plus vaste.
- **Opportunité Trouvée** : Un chemin complexe à 3-4 sauts a généré un profit net validé.
- **Exemple** : `USDC -> ... -> USDC` avec un score de `+2.91`.

### 3. Performance
- **Capital Initial** : 1000
- **Solde Final (après ~20 itérations)** : ~1002.91 (Profit +0.29%)
- *Note : Ce résultat dépend de la volatilité simulée du mock.*

## Analyse Comparative (Stress Test)
**Paramètres** : `MIN_PROFIT=0.15%`, `MAX_HOPS=7`

### 1. Stratégie TIERED (Sécurisée)
- **Capital 1000$** : Profit **+3.59 USDC** (+0.36%)
- **Capital 3000$** : Profit **+6.01 USDC** (+0.20%)
- **Analyse** : Le bot filtre les chemins "toxiques". Le rendement est plus faible car il ignore les opportunités à haut risque (ex: MAI/LUSD sans grosse prime).

### 2. Stratégie FREE_MARKET (Aggressive)
- **Capital 1000$** : Profit **+5.09 USDC** (+0.51%)
- **Capital 3000$** : Profit **+7.32 USDC** (+0.24%)
- **Analyse** : 
  - **Surperformance de +40%** à court terme par rapport au Tiered.
  - **Risque** : Le bot n'hésite pas à passer par des stablecoins très volatils ou à faible liquidité pour gratter quelques centimes.
  - **Recommandation** : À utiliser uniquement sous surveillance ou avec des montants que l'on est prêt à risquer sur un depeg (ex: MAI).

## Conclusion Générale
- **Pour Dormir Tranquille** : Utilisez `TIERED`. La sous-performance est le prix de l'assurance.
- **Pour le Rendement Max** : Utilisez `FREE_MARKET`.
- **Ressources** : La profondeur `MAX_HOPS=7` est validée mais exige un RPC privé puissant.
