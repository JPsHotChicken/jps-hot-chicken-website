// Food imagery for the "Big Combo" build-your-combo showcase on the home page.
// Files live under public/images/food/<category>/. Edit here to add/remove items.

export type FoodImage = { src: string; alt: string };

export const entrees: FoodImage[] = [
  { src: "/images/food/entree/jpsSandwich.jpg", alt: "JP's hot chicken sandwich" },
  { src: "/images/food/entree/chickenAndWaffles.jpg", alt: "Hot chicken and waffles" },
  { src: "/images/food/entree/wholeWings.jpg", alt: "Whole hot wings" },
  { src: "/images/food/entree/Wings NonBreaded.jpg", alt: "Non-breaded hot wings" },
  { src: "/images/food/entree/chickenBurrito.jpg", alt: "Hot chicken burrito" },
  { src: "/images/food/entree/catfish.jpg", alt: "Fried catfish" },
];

export const sides: FoodImage[] = [
  { src: "/images/food/sides/fries.jpg", alt: "Fries" },
  { src: "/images/food/sides/cajunFries.jpg", alt: "Cajun fries" },
  { src: "/images/food/sides/macAndCheese.jpg", alt: "Mac & cheese" },
  { src: "/images/food/sides/coleslaw.jpg", alt: "Coleslaw" },
  { src: "/images/food/sides/bakedBeans.jpg", alt: "Baked beans" },
  { src: "/images/food/sides/friedPickles.jpg", alt: "Fried pickles" },
  { src: "/images/food/sides/friedOkra.jpg", alt: "Fried okra" },
  { src: "/images/food/sides/JalapenoPoppersNew.jpg", alt: "Jalapeño poppers" },
  { src: "/images/food/sides/biscuit.jpg", alt: "Biscuit" },
];

export const dippingSauces: FoodImage[] = [
  { src: "/images/food/dippingSauce/JPsSauce_edited.jpg", alt: "JP's sauce" },
  { src: "/images/food/dippingSauce/ranch_edited.jpg", alt: "Ranch" },
  { src: "/images/food/dippingSauce/BBQSauce_edited.jpg", alt: "BBQ sauce" },
  { src: "/images/food/dippingSauce/BuffaloSauce_edited.jpg", alt: "Buffalo sauce" },
  { src: "/images/food/dippingSauce/HoneyMustard_edited.jpg", alt: "Honey mustard" },
  { src: "/images/food/dippingSauce/HotHoney_edited.jpg", alt: "Hot honey" },
  { src: "/images/food/dippingSauce/HotSauce_edited_edited_edited.jpg", alt: "Hot sauce" },
  { src: "/images/food/dippingSauce/tarterSauce_edited.jpg", alt: "Tartar sauce" },
  { src: "/images/food/dippingSauce/syrup_edited.jpg", alt: "Syrup" },
];

export const drinks: FoodImage[] = [
  { src: "/images/food/drinks/Coke.jpg", alt: "Coke" },
  { src: "/images/food/drinks/dietCoke.jpg", alt: "Diet Coke" },
  { src: "/images/food/drinks/cokeZero.jpg", alt: "Coke Zero" },
  { src: "/images/food/drinks/sprite.jpg", alt: "Sprite" },
  { src: "/images/food/drinks/fruitPunch.jpg", alt: "Fruit punch" },
  { src: "/images/food/drinks/sweetTea.jpg", alt: "Sweet tea" },
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
