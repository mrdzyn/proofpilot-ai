const cartCount = document.querySelector('[data-testid="cart-count"]');
const addToCart = document.querySelector('[data-testid="add-to-cart"]');

let count = 0;

addToCart.addEventListener('click', () => {
  count += 1;
  cartCount.textContent = String(count);
});
