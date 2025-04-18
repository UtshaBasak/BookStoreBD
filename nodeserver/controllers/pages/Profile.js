export const Profile = {
    getProfile: async (req, res) => {
        try {
            res.status(200).json({
                status: "success",
                message: "Profile retrieved successfully",
                data: req.user
            });
        } catch (error) {
            res.status(500).json({
                status: "error",
                message: error.message
            });
        }
    },

    updateProfile: async (req, res) => {
        try {
            const updates = req.body;
            Object.assign(req.user, updates);
            await req.user.save();
            
            res.status(200).json({
                status: "success",
                message: "Profile updated successfully",
                data: req.user
            });
        } catch (error) {
            res.status(500).json({
                status: "error",
                message: error.message
            });
        }
    }
};

export default Profile;
