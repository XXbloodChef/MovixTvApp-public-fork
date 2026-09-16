/** @type {import('tailwindcss').Config} */
export default {
  content: ["./BOTINDEXSECURITY.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Le rouge de Movix, jusqu'ici recopié en dur dans les feuilles de
        // style des lecteurs (`#e50914`). Sur l'interface TV il ne sert plus de
        // marqueur de focus — le blanc s'en charge partout — mais uniquement à
        // porter de l'information : les barres de progression de lecture.
        movix: {
          red: '#e50914',
          'red-bright': '#ff3b47',
          // Fond de l'interface TV. Repris en dur dans les dégradés de la
          // bannière, où la valeur doit correspondre exactement sous peine de
          // laisser une couture visible entre l'image et la page.
          ink: '#0a0a0a',
        },
      },
      // Échelle calée sur le viewport CSS 960×540 de la WebView, pas sur
      // 1280 ni 1920. Les tailles Tailwind par défaut (text-base à 16 px) sont
      // dimensionnées pour un écran de bureau à 60 cm ; à 2,5 m, 12 px est le
      // plancher absolu de lisibilité.
      fontSize: {
        'tv-hero': ['40px', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'tv-row': ['19px', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'tv-body': ['15px', { lineHeight: '1.6' }],
        'tv-card': ['12px', { lineHeight: '1.2' }],
        'tv-meta': ['11px', { lineHeight: '1.2' }],
      },
      spacing: {
        // Zone de sûreté horizontale. Pas d'overscan sur la dalle de référence,
        // mais 5 % restent la marge sur laquelle les autres interfaces de salon
        // se calent — s'en écarter donne un rendu « trop au bord ».
        'tv-safe': '48px',
        'tv-safe-y': '27px',
      },
      animation: {
        fadeIn: "fadeIn 0.5s ease-in-out",
        fadeOut: "fadeOut 0.5s ease-in-out",
        "skeleton-fade": "skeletonFade 0.3s ease-out",
        "card-enter": "cardEnter 0.3s ease-out both",
        heroFade: "heroFade 420ms ease-out both",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(-20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeOut: {
          "0%": { opacity: "1", transform: "translateY(0)" },
          "100%": { opacity: "0", transform: "translateY(-20px)" },
        },
        skeletonFade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        cardEnter: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // Fondu de la bannière. Opacité seule : pas de `translate`, qui
        // déplacerait une image plein cadre et coûterait une composition de
        // couche à chaque frame pour un effet que personne ne remarque.
        heroFade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
