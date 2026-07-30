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

const imageInput = document.getElementById("image");
const preview = document.getElementById("preview");
const titleInput = document.getElementById("title");
const priceInput = document.getElementById("price");
const categorySelect = document.getElementById("category");
const addButton = document.getElementById("add");
const adminContainer = document.getElementById("admin-products-container");

let imageBase64 = "";

// اختيار الصورة وتصغيرها
if (imageInput) {
    imageInput.addEventListener("change", function () {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.src = e.target.result;
                
                img.onload = function () {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    
                    const maxWidth = 600; 
                    const scaleRatio = maxWidth / img.width;

                    if (img.width > maxWidth) {
                        canvas.width = maxWidth;
                        canvas.height = img.height * scaleRatio;
                    } else {
                        canvas.width = img.width;
                        canvas.height = img.height;
                    }

                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    imageBase64 = canvas.toDataURL("image/jpeg", 0.85);
                    preview.src = imageBase64;
                };
            };
            reader.readAsDataURL(file);
        }
    });
}

// عرض المنتجات
function renderAdminProducts() {
    if (!adminContainer) return;
    adminContainer.innerHTML = "";

    const products = JSON.parse(localStorage.getItem("products")) || [];

    if (products.length === 0) {
        adminContainer.innerHTML = "<p style='width:100%; font-size:18px;'>لا توجد منتجات حالياً.</p>";
        return;
    }

    products.forEach((product, index) => {
        adminContainer.innerHTML += `
            <div class="card">
                <img src="${product.image}" alt="${product.name}">
                <h3>${product.name}</h3>
                <p>${product.price}</p>
                <button class="delete-btn" data-index="${index}" style="background: #e74c3c;">حذف المنتج</button>
            </div>
        `;
    });
}

// الاستماع لضغطات زر الحذف بطريقة تتوافق مع iOS ومتصفح Spck
if (adminContainer) {
    adminContainer.addEventListener("click", function (e) {
        if (e.target.classList.contains("delete-btn")) {
            const index = e.target.getAttribute("data-index");
            let products = JSON.parse(localStorage.getItem("products")) || [];
            
            // حذف العنصر من المصفوفة مباشرة
            products.splice(index, 1);
            
            // تحديث الذاكرة
            localStorage.setItem("products", JSON.stringify(products));
            
            // إعادة رسم المنتجات
            renderAdminProducts();
        }
    });
}

// إضافة منتج جديد
if (addButton) {
    addButton.addEventListener("click", function () {
        const title = titleInput.value.trim();
        const price = priceInput.value.trim();
        const category = categorySelect.value;

        if (!title || !price || !imageBase64) {
            alert("برجاء ملء جميع البيانات واختيار صورة أولاً!");
            return;
        }

        const newProduct = {
            name: title,
            price: price + " ج.م",
            image: imageBase64,
            category: category
        };

        try {
            let storedProducts = JSON.parse(localStorage.getItem("products")) || [];
            storedProducts.push(newProduct);
            localStorage.setItem("products", JSON.stringify(storedProducts));

            alert("تمت إضافة المنتج بنجاح!");

            titleInput.value = "";
            priceInput.value = "";
            preview.src = "";
            imageInput.value = "";
            imageBase64 = "";

            renderAdminProducts();
        } catch (error) {
            alert("المساحة لا تكفي، يرجى مسح بعض المنتجات القديمة!");
        }
    });
}

document.addEventListener("DOMContentLoaded", renderAdminProducts);
