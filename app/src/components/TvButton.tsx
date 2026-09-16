import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { IS_TV } from '../services/deviceInfo';

interface TvButtonProps {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  /** Reçoit le focus à l'ouverture de l'écran. Un seul bouton par écran. */
  preferredFocus?: boolean;
}

/**
 * Bouton utilisable à la télécommande.
 *
 * `TouchableOpacity` est bien focusable sur Android TV, mais son `activeOpacity`
 * ne réagit qu'à l'appui, pas au focus : sans état visuel explicite, rien
 * n'indique quel bouton est sélectionné. Sur téléphone le composant se comporte
 * exactement comme avant.
 */
export default function TvButton({
  label,
  onPress,
  style,
  textStyle,
  preferredFocus,
}: TvButtonProps) {
  const [focused, setFocused] = useState(false);

  return (
    <TouchableOpacity
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={IS_TV && preferredFocus === true}
      accessibilityRole="button"
      activeOpacity={0.8}
      style={[style, IS_TV && focused ? styles.focused : null]}>
      <Text style={textStyle}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  focused: {
    // Bordure + agrandissement plutôt qu'un simple changement de couleur : à
    // trois mètres, une nuance de fond ne se distingue pas.
    borderWidth: 2,
    borderColor: '#a78bfa',
    transform: [{ scale: 1.06 }],
  },
});
