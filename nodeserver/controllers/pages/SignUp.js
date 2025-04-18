export const SignUp = {
    getSignUpPage: async (req, res) => {
        try {
            res.render('signup');
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
};

export default SignUp;
