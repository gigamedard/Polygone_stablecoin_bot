# 🚀 Projet : Bot d'Arbitrage de Stablecoins sur Polygon

## 📄 Résumé Exécutif
Ce projet est un robot de trading algorithmique autonome (bot) conçu pour générer des profits passifs sur la blockchain Polygon. Il exploite les micro-variations de prix entre les différents "stablecoins" (crypto-monnaies adossées au dollar comme USDC, USDT, DAI) sur les marchés décentralisés.

Le bot surveille les marchés 24h/24 et 7j/7 pour détecter des déséquilibres (ex: 1 USDC s'échange contre 1.002 DAI). Lorsqu'une opportunité rentable est identifiée, il exécute instantanément l'échange via un "Smart Contract" optimisé, empochant la différence.

---

## 💡 La Stratégie "Greedy Tiered" (Le Moteur de Profit)

Le cœur du système repose sur une stratégie hybride unique qui privilégie la rapidité d'exécution et la sécurité des fonds.

### 1. Analyse de Marché "Greedy" (Avide & Rapide)
Contrairement aux bots complexes qui cherchent des routes longues et coûteuses (A -> B -> C -> A), ce bot se concentre sur l'efficacité pure :
*   **Swaps Directs** : Il analyse uniquement les échanges directs (1 saut) depuis le token actuellement détenu.
*   **Avantage** : Cette approche réduit drastiquement les frais de transaction (Gas) et augmente la vitesse de réaction, permettant de battre la concurrence sur les meilleures opportunités.
*   **Cibles** : Il surveille en permanence les paires liquides sur **Uniswap V3** et **Curve Finance**.

### 2. Gestion des Risques par "Tiers" (Sécurité Maximale)
Tous les stablecoins ne se valent pas. Le bot intègre un système de notation de risque pour protéger le capital :
*   **Tier A (Premium)** : USDC, USDT (Très faible risque).
*   **Tier B (Standard)** : DAI, FRAX.
*   **Tier C (Risqué)** : MAI, LUSD.
*   **Mécanisme** : Le bot applique une "pénalité virtuelle" au profit calculé s'il doit échanger un token sûr (Tier A) contre un token plus risqué (Tier C). Il ne prendra ce risque que si le profit est *exceptionnel* pour compenser.

---

## 🛡️ Mécanismes de Sécurité Clés

Pour rassurer les investisseurs, le système intègre plusieurs "Filets de Sécurité" :

1.  **Force Exit (Sortie de Secours)** : Si le bot reste bloqué avec un token pendant plus de 4 heures (ex: le marché stagne), il vend automatiquement sa position pour revenir en USDC, évitant ainsi de rester exposé à long terme.
2.  **Seuil de Profit Minimum** : Aucune transaction n'est lancée si le profit net (après frais de blockchain) n'atteint pas un seuil défini (ex: 0.15% ou 0.20$ par trade).
3.  **Exécution Atomique** : Les transactions passent par un Smart Contract (`FlashArbitrage`). Si le trading échoue ou si le profit n'est pas au rendez-vous au moment de la validation, la transaction est annulée en totalité. Le capital n'est jamais perdu par une exécution partielle.

## 📊 Pourquoi ce Projet ? (Arguments Clés)
*   **Autonomie Totale** : Une fois lancé, le bot gère le capital, les échanges et la sécurité sans intervention humaine.
*   **Infrastructure Légère** : Optimisé pour tourner avec des coûts d'infrastructure minimes tout en restant compétitif.
*   **Transparence** : Chaque décision est loggée, et les profits sont calculés en temps réel par rapport au capital initial.

---

## 🛠️ Stack Technique
*   **Langage** : Node.js (Moteur), Solidity (Smart Contracts).
*   **Blockchain** : Polygon (Mainnet) pour ses frais faibles.
*   **Protocoles Intégrés** : Uniswap V3, Curve, Aave.
