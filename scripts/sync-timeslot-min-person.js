const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function run() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('MONGO_URI not set');
        process.exit(1);
    }

    try {
        await mongoose.connect(uri);
        console.log('✅ Connected to database');

        const tours = await mongoose.connection.db.collection('tours').find({}).toArray();
        console.log(`Found ${tours.length} tours.`);

        let updatedCount = 0;

        for (const tour of tours) {
            // Default to 1 if not specified
            const tourMinPerson = tour.minimumPerson || 1;

            console.log(`Processing Tour: ${tour.title} (ID: ${tour._id}) - Min Person: ${tourMinPerson}`);

            // Find future timeslots
            const today = new Date().toISOString().split('T')[0];
            const TimeSlots = mongoose.connection.db.collection('timeslots');

            const slots = await TimeSlots.find({
                packageType: 'tour',
                packageId: tour._id,
                date: { $gte: today }
            }).toArray();

            for (const slotDoc of slots) {
                let docModified = false;
                const updatedSlots = slotDoc.slots.map(s => {
                    // If booked, we generally don't want to mess with it, or it should already be 1. 
                    // But strict sync means unbooked slots MUST match tour config.
                    if (s.bookedCount === 0 && s.minimumPerson !== tourMinPerson) {
                        s.minimumPerson = tourMinPerson;
                        docModified = true;
                    }
                    return s;
                });

                if (docModified) {
                    await TimeSlots.updateOne(
                        { _id: slotDoc._id },
                        { $set: { slots: updatedSlots } }
                    );
                    updatedCount++;
                }
            }
        }

        console.log(`\n✅ Successfully synced ${updatedCount} TimeSlot documents.`);

        await mongoose.disconnect();
        console.log('Disconnected from database');
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

run();
