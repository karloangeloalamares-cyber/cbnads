"use client";

import { useEffect, useState, useRef } from "react";
import { Plus, MoreVertical, Edit, Trash2 } from "lucide-react";
import { appToast } from "@/lib/toast";
import NewProductForm from "./NewProductForm";

// Helper to format date without timezone shift
const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString();
};

export default function ProductsList({ refresh }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState({
    vertical: "bottom",
    horizontal: "right",
  });
  const [editingProduct, setEditingProduct] = useState(null);
  const [deletingProduct, setDeletingProduct] = useState(null);
  const menuRef = useRef(null);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/products/list");

      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }

      const data = await response.json();
      setProducts(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [refresh]);

  useEffect(() => {
    if (!error) {
      return;
    }

    appToast.error({
      title: "Unable to load products",
      description: error,
    });
  }, [error]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleProductCreated = () => {
    setShowNewProductForm(false);
    fetchProducts();
  };

  const handleMenuClick = (productId, event) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;
    const menuHeight = 350; // Increased threshold to open upward more aggressively
    const menuWidth = 200;

    setMenuPosition({
      vertical: spaceBelow < menuHeight ? "top" : "bottom",
      horizontal: spaceRight < menuWidth ? "left" : "right",
    });

    setActiveMenu(activeMenu === productId ? null : productId);
  };

  const handleEditClick = (product) => {
    setEditingProduct(product);
    setActiveMenu(null);
  };

  const handleDeleteClick = (product) => {
    setDeletingProduct(product);
    setActiveMenu(null);
  };

  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/products/${editingProduct.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: editingProduct.product_name,
          placement: editingProduct.placement,
          price: parseFloat(editingProduct.price),
        }),
      });

      if (!response.ok) throw new Error("Failed to update product");

      setEditingProduct(null);
      appToast.success({
        title: "Product updated",
        description: `${editingProduct.product_name} was saved successfully.`,
      });
      fetchProducts();
    } catch (err) {
      console.error(err);
      setError("Failed to update product");
    }
  };

  const handleDeleteProduct = async () => {
    try {
      const response = await fetch(`/api/products/${deletingProduct.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete product");

      appToast.success({
        title: "Product deleted",
        description: `${deletingProduct.product_name} was removed.`,
      });
      setDeletingProduct(null);
      fetchProducts();
    } catch (err) {
      console.error(err);
      setError("Failed to delete product");
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">
              Products
            </h1>
            <p className="text-sm text-gray-500">
              Manage your ad packages and products
            </p>
          </div>
          <button
            onClick={() => setShowNewProductForm(true)}
            className="px-5 py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <Plus size={18} />
            Add new Product
          </button>
        </div>

        {/* New Product Form */}
        {showNewProductForm && (
          <div className="mb-6">
            <NewProductForm onProductCreated={handleProductCreated} />
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-500">Loading products...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">
              Products
            </h1>
            <p className="text-sm text-gray-500">
              Manage your ad packages and products
            </p>
          </div>
          <button
            onClick={() => setShowNewProductForm(true)}
            className="px-5 py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <Plus size={18} />
            Add new Product
          </button>
        </div>

        {/* New Product Form */}
        {showNewProductForm && (
          <div className="mb-6">
            <NewProductForm onProductCreated={handleProductCreated} />
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center space-y-4">
          <p className="text-gray-600">
            We could not load products right now.
          </p>
          <button
            type="button"
            onClick={fetchProducts}
            className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">
              Products
            </h1>
            <p className="text-sm text-gray-500">
              Manage your ad packages and products
            </p>
          </div>
          <button
            onClick={() => setShowNewProductForm(true)}
            className="px-5 py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <Plus size={18} />
            Add new Product
          </button>
        </div>

        {/* New Product Form */}
        {showNewProductForm && (
          <div className="mb-6">
            <NewProductForm onProductCreated={handleProductCreated} />
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-500">
            No products yet. Click "Add new Product" to create your first ad
            package!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            Products
          </h1>
          <p className="text-sm text-gray-500">
            Manage your ad packages and products
          </p>
        </div>
        <button
          onClick={() => setShowNewProductForm(true)}
          className="px-5 py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
        >
          <Plus size={18} />
          Add new Product
        </button>
      </div>

      {/* New Product Form */}
      {showNewProductForm && (
        <div className="mb-6">
          <NewProductForm onProductCreated={handleProductCreated} />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700">
                Product Name
              </th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700">
                Placement
              </th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700">
                Price
              </th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700">
                Created
              </th>
              <th className="px-6 py-3 text-right text-[11px] font-semibold text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-gray-50">
                <td className="px-6 py-3.5 text-xs text-gray-900">
                  {product.product_name}
                </td>
                <td className="px-6 py-3.5">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                    {product.placement}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-xs font-semibold text-gray-900">
                  ${parseFloat(product.price).toFixed(2)}
                </td>
                <td className="px-6 py-3.5 text-xs text-gray-500">
                  {formatDate(product.created_at)}
                </td>
                <td
                  className="px-6 py-3.5 text-right relative"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => handleMenuClick(product.id, e)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <MoreVertical size={18} className="text-gray-500" />
                  </button>

                  {activeMenu === product.id && (
                    <div
                      ref={menuRef}
                      className={`absolute ${menuPosition.vertical === "top" ? "bottom-full mb-1" : "top-full mt-1"} ${menuPosition.horizontal === "left" ? "right-0" : "left-auto"} w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[100] py-1`}
                    >
                      <button
                        onClick={() => handleEditClick(product)}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                      >
                        <Edit size={16} className="text-gray-400" />
                        Edit
                      </button>
                      <div className="border-t border-gray-100 my-1"></div>
                      <button
                        onClick={() => handleDeleteClick(product)}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                      >
                        <Trash2 size={16} className="text-red-500" />
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Product Modal */}
      {editingProduct && (
        <>
          <div
            onClick={() => setEditingProduct(null)}
            className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          ></div>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
              <div className="px-6 py-5 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  Edit Product
                </h2>
              </div>

              <form onSubmit={handleUpdateProduct} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={editingProduct.product_name}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        product_name: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Placement
                  </label>
                  <select
                    value={editingProduct.placement}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        placement: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    required
                  >
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Website">Website</option>
                    <option value="App">App</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingProduct.price}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        price: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    Update Product
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deletingProduct && (
        <>
          <div
            onClick={() => setDeletingProduct(null)}
            className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          ></div>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Delete Product
              </h2>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete "{deletingProduct.product_name}
                "? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteProduct}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setDeletingProduct(null)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
