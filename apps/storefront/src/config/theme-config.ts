// Theme configuration for dynamic category theming
// Based on color psychology research for gender-targeted e-commerce

export type ThemeType = 'default' | 'women' | 'men' | 'children';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  background: string;
  backgroundDark: string;
  accent: string;
  text: string;
  textLight: string;
}

export interface ThemeConfig {
  id: ThemeType;
  name: string;
  description: string;
  colors: ThemeColors;
}

export const themes: Record<ThemeType, ThemeConfig> = {
  default: {
    id: 'default',
    name: 'BLESSLUXE',
    description: 'Luxury gold theme',
    colors: {
      primary: '#C9A84C',      // Gold
      primaryDark: '#B8860B',
      primaryLight: '#D4AF37',
      secondary: '#1A1A1A',    // Black
      background: '#FDF8F3',   // Cream
      backgroundDark: '#F5EDE3',
      accent: '#F5E6E0',       // Blush
      text: '#1A1A1A',
      textLight: '#666666',
    },
  },
  women: {
    id: 'women',
    name: 'Women',
    description: 'Elegant feminine rose theme',
    colors: {
      primary: '#D4A5A5',      // Rose
      primaryDark: '#B08B8B',  // Mauve
      primaryLight: '#E8C4C4',
      secondary: '#8B6B6B',    // Dusty rose
      background: '#FFF5F5',   // Soft pink
      backgroundDark: '#FFE8E8',
      accent: '#F5E6E0',       // Blush
      text: '#5C4A4A',
      textLight: '#8B7676',
    },
  },
  men: {
    id: 'men',
    name: 'Men',
    description: 'Sophisticated masculine navy theme',
    colors: {
      primary: '#1E3A5F',      // Navy
      primaryDark: '#152A45',
      primaryLight: '#2A4F7A',
      secondary: '#4A5568',    // Steel gray
      background: '#F5F7FA',   // Slate white
      backgroundDark: '#E8ECF1',
      accent: '#6B7B8C',       // Steel
      text: '#1A202C',
      textLight: '#4A5568',
    },
  },
  children: {
    id: 'children',
    name: 'Children',
    description: 'Playful vibrant theme',
    colors: {
      primary: '#FF6B6B',      // Coral
      primaryDark: '#E85A5A',
      primaryLight: '#FF8585',
      secondary: '#4ECDC4',    // Teal
      background: '#FFFDF5',   // Soft yellow tint
      backgroundDark: '#FFF8E5',
      accent: '#A8E6CF',       // Mint
      text: '#2D3748',
      textLight: '#5A6B7C',
    },
  },
};

// Map URL categories to themes
export const categoryThemeMap: Record<string, ThemeType> = {
  // Women's categories
  women: 'women',
  dresses: 'women',
  tops: 'women',
  bottoms: 'women',
  // Men's categories
  men: 'men',
  suits: 'men',
  shirts: 'men',
  trousers: 'men',
  knitwear: 'men',
  // Children's categories
  children: 'children',
  boys: 'children',
  girls: 'children',
  baby: 'children',
};

export const getThemeForCategory = (category: string | null): ThemeType => {
  if (!category) return 'default';
  return categoryThemeMap[category.toLowerCase()] || 'default';
};

export const getThemeConfig = (theme: ThemeType): ThemeConfig => {
  return themes[theme];
};
