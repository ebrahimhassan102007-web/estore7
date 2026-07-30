const defaultProducts = [
    {
        name: "تيشيرت رجالي",
        price: "499 ج.م",
        image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600",
        category: "men"
    },
    {
        name: "فستان نسائي",
        price: "899 ج.م",
        image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600",
        category: "women"
    },
    {
        name: "ملابس أطفال",
        price: "399 ج.م",
        image: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600",
        category: "kids"
    },
    {
        name: "بنطال جينز - عرض خاص",
        price: "699 ج.م",
        image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600",
        category: "offers"
    }
];

if (!localStorage.getItem("products")) {
    localStorage.setItem("products", JSON.stringify(defaultProducts));
}

// عناصر الصفحة
const container = document.querySelector(".best-products .products");
const cartCountElement = document.getElementById("cart-count");
const cartModal = document.getElementById("cart-modal");
const cartItemsContainer = document.getElementById("cart-items");
const cartTotalPriceElement = document.getElementById("cart-total-price");
const sectionTitleElement = document.getElementById("section-title");

// قاموس عناوين الأقسام
const categoryTitles = {
    all: "أفضل المنتجات",
    men: "قسم الملابس الرجالي",
    women: "قسم الملابس النسائي",
    kids: "قسم ملابس الأطفال",
    offers: "قسم العروض والخصومات"
};

// تحديث عداد السلة
function updateCartCount() {
    let cart = JSON.parse(localStorage.getItem("cart")) || [];
    cart = cart.filter(item => item && typeof item === "object" && item.price);
    if (cartCountElement) {
        cartCountElement.textContent = cart.length;
    }
}

// عرض المنتجات داخل نافذة السلة مع الإجمالي
function renderCart() {
    let cart = JSON.parse(localStorage.getItem("cart")) || [];
    cart = cart.filter(item => item && typeof item === "object" && item.price);
    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartCount();

    if (!cartItemsContainer) return;

    cartItemsContainer.innerHTML = "";
    let total = 0;

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = "<p style='text-align:center;'>السلة فارغة حالياً.</p>";
        if (cartTotalPriceElement) cartTotalPriceElement.textContent = "0";
        return;
    }

    cart.forEach((item, index) => {
        const numericPrice = parseFloat(String(item.price).replace(/[^0-9.]/g, '')) || 0;
        total += numericPrice;

        cartItemsContainer.innerHTML += `
            <div class="cart-item-row">
                <img src="${item.image || ''}" alt="${item.name}">
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    <p>${item.price}</p>
                </div>
                <button class="cart-remove-btn" data-index="${index}">حذف</button>
            </div>
        `;
    });

    if (cartTotalPriceElement) {
        cartTotalPriceElement.textContent = total;
    }
}

// إضافة منتج للسلة
function addToCart(product) {
    let cart = JSON.parse(localStorage.getItem("cart")) || [];
    cart = cart.filter(item => item && typeof item === "object" && item.price);
    
    cart.push(product);
    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartCount();
    alert("تمت إضافة " + product.name + " إلى السلة!");
}

// عرض المنتجات حسب القسم وتحديث العنوان
function showCategory(category) {
    if (!container) return;
    container.innerHTML = "";

    // تحديث عنوان القسم
    if (sectionTitleElement) {
        sectionTitleElement.textContent = categoryTitles[category] || "أفضل المنتجات";
    }

    const products = JSON.parse(localStorage.getItem("products")) || [];

    let list;
    if (category === "all") {
        list = products;
    } else {
        list = products.filter(product => product.category === category);
    }

    if (list.length === 0) {
        container.innerHTML = "<p style='text-align:center; width:100%; font-size:18px;'>لا توجد منتجات في هذا القسم حالياً.</p>";
        return;
    }

    list.forEach(product => {
        const originalIndex = products.findIndex(p => p.name === product.name && p.price === product.price);
        
        container.innerHTML += `
            <div class="card">
                <img src="${product.image}" alt="${product.name}">
                <h3>${product.name}</h3>
                <p>${product.price}</p>
                <button class="add-to-cart-btn" data-index="${originalIndex}">إضافة للسلة</button>
            </div>
        `;
    });
}

// إدارة النقرات في الصفحة بالكامل
document.addEventListener("click", function (e) {
    // 1. الضغط على أي قسم في القائمة العلوية
    const categoryLink = e.target.closest(".nav-category-link");
    if (categoryLink) {
        e.preventDefault();
        const category = categoryLink.getAttribute("data-category");
        showCategory(category);

        // التمرير السلس إلى قسم المنتجات
        const bestProductsSection = document.querySelector(".best-products");
        if (bestProductsSection) {
            bestProductsSection.scrollIntoView({ behavior: "smooth" });
        }
        return;
    }

    // 2. الضغط على زر إضافة للسلة
    if (e.target.classList.contains("add-to-cart-btn")) {
        const index = e.target.getAttribute("data-index");
        const products = JSON.parse(localStorage.getItem("products")) || [];
        if (products[index]) {
            addToCart(products[index]);
        }
        return;
    }

    // 3. فتح السلة عند الضغط على زر السلة فوق
    if (e.target.closest(".cart-btn")) {
        renderCart();
        if (cartModal) cartModal.style.display = "flex";
        return;
    }

    // 4. إغلاق السلة عند الضغط على زر X أو الخلفية
    if (e.target.id === "close-cart" || e.target === cartModal) {
        if (cartModal) cartModal.style.display = "none";
        return;
    }

    // 5. حذف عنصر من داخل السلة
    if (e.target.classList.contains("cart-remove-btn")) {
        const index = e.target.getAttribute("data-index");
        let cart = JSON.parse(localStorage.getItem("cart")) || [];
        cart.splice(index, 1);
        localStorage.setItem("cart", JSON.stringify(cart));
        renderCart();
        return;
    }
});

document.addEventListener("DOMContentLoaded", () => {
    showCategory("all");
    updateCartCount();
});
