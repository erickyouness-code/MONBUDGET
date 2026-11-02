import { Redirect } from 'expo-router';

/**
 * Emplacement réservé au bouton « + » de la barre d'onglets.
 * Le bouton ouvre la fenêtre /add ; si on arrive ici par un lien, on y redirige.
 */
export default function NewPlaceholder() {
  return <Redirect href="/add" />;
}
