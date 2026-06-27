// Food imagery for the "Big Combo" build-your-combo showcase on the home page.
// Files live under public/images/food/<category>/. Edit here to add/remove items.

export type FoodImage = { src: string; alt: string };

export const entrees: FoodImage[] = [
  { src: "/images/food/entree/jpsSandwich.webp", alt: "JP's hot chicken sandwich" },
  { src: "/images/food/entree/chickenAndWaffles.webp", alt: "Hot chicken and waffles" },
  { src: "/images/food/entree/wholeWings.webp", alt: "Whole hot wings" },
  { src: "/images/food/entree/Wings NonBreaded.webp", alt: "Non-breaded hot wings" },
  { src: "/images/food/entree/chickenBurrito.webp", alt: "Hot chicken burrito" },
  { src: "/images/food/entree/catfish.webp", alt: "Fried catfish" },
];

export const sides: FoodImage[] = [
  { src: "/images/food/sides/fries.webp", alt: "Fries" },
  { src: "/images/food/sides/cajunFries.webp", alt: "Cajun fries" },
  { src: "/images/food/sides/macAndCheese.webp", alt: "Mac & cheese" },
  { src: "/images/food/sides/coleslaw.webp", alt: "Coleslaw" },
  { src: "/images/food/sides/bakedBeans.webp", alt: "Baked beans" },
  { src: "/images/food/sides/friedPickles.webp", alt: "Fried pickles" },
  { src: "/images/food/sides/friedOkra.webp", alt: "Fried okra" },
  { src: "/images/food/sides/JalapenoPoppersNew.webp", alt: "Jalapeño poppers" },
  { src: "/images/food/sides/sweetCorn.webp", alt: "Sweet corn" },
  { src: "/images/food/sides/biscuit.webp", alt: "Biscuit" },
];

export const dippingSauces: FoodImage[] = [
  { src: "/images/food/dippingSauce/JPsSauce_edited.webp", alt: "JP's sauce" },
  { src: "/images/food/dippingSauce/ranch_edited.webp", alt: "Ranch" },
  { src: "/images/food/dippingSauce/BBQSauce_edited.webp", alt: "BBQ sauce" },
  { src: "/images/food/dippingSauce/BuffaloSauce_edited.webp", alt: "Buffalo sauce" },
  { src: "/images/food/dippingSauce/HoneyMustard_edited.webp", alt: "Honey mustard" },
  { src: "/images/food/dippingSauce/HotHoney_edited.webp", alt: "Hot honey" },
  { src: "/images/food/dippingSauce/HotSauce_edited_edited_edited.webp", alt: "Hot sauce" },
  { src: "/images/food/dippingSauce/tarterSauce_edited.webp", alt: "Tartar sauce" },
  { src: "/images/food/dippingSauce/syrup_edited.webp", alt: "Syrup" },
];

export const drinks: FoodImage[] = [
  { src: "/images/food/drinks/fountainDrink.webp", alt: "Fountain drink" },
  { src: "/images/food/drinks/icedTea.webp", alt: "Iced tea" },
  { src: "/images/food/drinks/bottledDrink.webp", alt: "Bottled drink" },
];

// Full combo plates for the home-page photo gallery. These are the frame-free
// crops (the originals in ../ have a decorative black border baked in).
export const combos: FoodImage[] = [
  { src: "/images/food/combos/cropped/chickenSandwichCombo.png", alt: "Hot chicken sandwich combo" },
  { src: "/images/food/combos/cropped/chickenWafflesCombo.png", alt: "Hot chicken & waffles combo" },
  { src: "/images/food/combos/cropped/wholeWingsCombo.png", alt: "Whole hot wings combo" },
  { src: "/images/food/combos/cropped/partyWingsCombo.png", alt: "Party wings combo" },
  { src: "/images/food/combos/cropped/jumboTendersCombo.png", alt: "Jumbo tenders combo" },
  { src: "/images/food/combos/cropped/chickenBitesCombo.png", alt: "Chicken bites combo" },
  { src: "/images/food/combos/cropped/breastQuarterCombo.png", alt: "Breast quarter combo" },
  { src: "/images/food/combos/cropped/legQuarterCombo.png", alt: "Leg quarter combo" },
  { src: "/images/food/combos/cropped/burritoCombo.png", alt: "Hot chicken burrito combo" },
  { src: "/images/food/combos/cropped/shrimpBurritoCombo.png", alt: "Shrimp burrito combo" },
  { src: "/images/food/combos/cropped/shrimpBitesCombo.png", alt: "Shrimp bites combo" },
  { src: "/images/food/combos/cropped/catfishCombo.png", alt: "Catfish combo" },
];
