import React, { useState, useEffect } from 'react';
import { housingService } from '../../services/housingService';
import { Link } from 'react-router-dom';

const SearchPage: React.FC = () => {
    const [properties, setProperties] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ city: '', minPrice: '', maxPrice: '' });

    useEffect(() => {
        fetchProperties();
    }, [filters]);

    const fetchProperties = async () => {
        setLoading(true);
        try {
            const res = await housingService.getProperties(filters);
            setProperties(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Find Your Home</h1>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-8 bg-white p-4 rounded-lg shadow-sm">
                <input
                    type="text"
                    placeholder="City"
                    className="border p-2 rounded w-48"
                    value={filters.city}
                    onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                />
                <input
                    type="number"
                    placeholder="Min Price"
                    className="border p-2 rounded w-32"
                    value={filters.minPrice}
                    onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
                />
                <input
                    type="number"
                    placeholder="Max Price"
                    className="border p-2 rounded w-32"
                    value={filters.maxPrice}
                    onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
                />
            </div>

            {loading ? (
                <p>Loading properties...</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {properties.map((p) => (
                        <div key={p._id} className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                            <img src={p.images[0] || 'https://via.placeholder.com/400x250'} alt={p.title} className="w-full h-48 object-cover" />
                            <div className="p-4">
                                <h2 className="text-xl font-semibold mb-2">{p.title}</h2>
                                <p className="text-gray-600 mb-2">{p.city}</p>
                                <p className="text-indigo-600 font-bold mb-4">${p.pricePerMonth} / Month</p>
                                <Link
                                    to={`/property/${p._id}`}
                                    className="block text-center bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                                >
                                    View Details
                                </Link>
                            </div>
                        </div>
                    ))}
                    {properties.length === 0 && <p className="col-span-full text-center text-gray-500">No properties found.</p>}
                </div>
            )}
        </div>
    );
};

export default SearchPage;
