// Mountain recipes. Each mountain = an item catalogue + placement rules (see cindercrest.ts).
import { ITEMS, PLACEMENT } from './cindercrest';

export interface Recipe {
  items: typeof ITEMS;
  placement: typeof PLACEMENT;
}

export const CINDERCREST: Recipe = { items: ITEMS, placement: PLACEMENT };
