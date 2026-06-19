import React, { useState, useEffect } from 'react';
import { housingService } from '../../services/housingService';

const MarketplacePage: React.FC = () => {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        try {
            const res = await housingService.getMarketplaceItems();
            setItems(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Student Marketplace</h1>
                <button className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition">
                    List an Item
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-12">
                {['Textbooks', 'Electronics', 'Furniture', 'Apparel', 'Services'].map((cat) => (
                    <button key={cat} className="bg-white border p-3 rounded-lg hover:border-indigo-500 hover:text-indigo-600 transition">
                        {cat}
                    </button>
                ))}
            </div>

            {loading ? (
                <p>Loading marketplace...</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {items.map((item) => (
                        <div key={item._id} className="bg-white rounded-lg shadow-sm border overflow-hidden hover:shadow-md transition">
                            <img src={item.images[0] || 'https://via.placeholder.com/300'} className="w-full h-40 object-cover" alt={item.title} />
                            <div className="p-4">
                                <p className="text-xs font-semibold text-indigo-600 uppercase mb-1">{item.category}</p>
                                <h3 className="font-bold mb-2 truncate">{item.title}</h3>
                                <p className="text-gray-500 text-sm mb-4 line-clamp-2">{item.description}</p>
                                <div className="flex justify-between items-center">
                                    <span className="text-lg font-bold">${item.price}</span>
                                    <button className="text-indigo-600 font-semibold hover:underline">View</button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {items.length === 0 && <p className="col-span-full text-center py-12 text-gray-500">No items listed yet. Be the first!</p>}
                </div>
            )}
        </div>
    );
};

export default MarketplacePage;
