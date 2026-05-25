sap.ui.define([
	"./BaseController"
], function (BaseController) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.App", {

		onInit: function () {
			this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
			this.getRouter().getRoute("home").attachPatternMatched(this._onHomeRoute, this);
			this.getRouter().attachRouteMatched(this._onRouteMatchedGlobally, this);
		},

		_onRouteMatchedGlobally: function (oEvent) {
			var sRouteName = oEvent.getParameter("name");
			
			// 1. Handle root container page transition & authentication check
			if (sRouteName !== "login") {
				var oUserModel = sap.ui.getCore().getModel("user");
				if (!oUserModel || !oUserModel.getProperty("/id")) {
					// User not logged in, redirect to login
					this.getRouter().navTo("login");
					return;
				}
				
				// Transition to main page
				var oRootApp = this.byId("idRootApp");
				if (oRootApp && oRootApp.getCurrentPage().getId() !== this.getView().createId("idMainPage")) {
					oRootApp.to(this.getView().createId("idMainPage"));
					this._updateUserInfo();
				}
			} else {
				// Transition to login page
				var oRootApp = this.byId("idRootApp");
				if (oRootApp && oRootApp.getCurrentPage().getId() !== this.getView().createId("idLoginPage")) {
					oRootApp.to(this.getView().createId("idLoginPage"));
				}
			}

			// 2. Side nav selection mapping
			var oSideNav = this.byId("idSideNav");
			if (!oSideNav) return;

			// Map specific routes to their sidebar keys
			var sKey = sRouteName;
			if (sRouteName === "GatePassCreation") {
				var oArgs = oEvent.getParameter("arguments");
				if (oArgs && oArgs.type === "NRGP") sKey = "nrgp";
				else if (oArgs && oArgs.type === "RGP") sKey = "rgp";
			} else if (sRouteName === "Home") {
				sKey = "home";
			} else if (sRouteName === "ScrapRequestDetail") {
				sKey = "ScrapRequestList";
			} else if (sRouteName === "AshGatePassDetail") {
				sKey = "AshGatePassList";
			}

			// Highlight the item
			oSideNav.setSelectedKey(sKey);
		},

		_onHomeRoute: function () {
			this.byId("idRootApp").to(this.getView().createId("idMainPage"));
			this._updateUserInfo();
		},

		_updateUserInfo: function () {
			var oUserModel = sap.ui.getCore().getModel("user");
			if (!oUserModel) return;
			var sFullName = oUserModel.getProperty("/fullName") || oUserModel.getProperty("/id") || "User";
			var sInitials = sFullName.trim().split(/\s+/).map(function (p) { return p.charAt(0); }).join("").substring(0, 2).toUpperCase();
			
			console.log("=== Active User Profile ===");
			console.log("Full Name:", sFullName);
			console.log("Initials:", sInitials);
			console.log("User Data Object:", oUserModel.getData());
			console.log("===========================");
            
			this.byId("idWelcomeText").setText("Welcome, " + sFullName);
			this.byId("idUserAvatar").setInitials(sInitials);
		},
		

		onButtonLogoutPress: function () {
			// Clear all frontend storages to ensure fresh state for next user
			localStorage.clear();
			sessionStorage.clear();

			// Clear all document cookies accessible via JS
			document.cookie.split(";").forEach(function(c) {
				document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
			});

			// Perform SAP logout via AJAX to avoid 403 Open Redirect block, then reload
			$.ajax({
				url: "/sap/public/bc/icf/logoff",
				type: "GET",
				complete: function() {
					// After backend session is destroyed, redirect to home to prompt login
					window.location.replace(window.location.origin + window.location.pathname);
				}
			});
		},

		onSideNavButtonPress: function () {
			var oToolPage = this.byId("idToolPage");
			oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
		},

		onItemSelect: function (oEvent) {
			var oItem = oEvent.getParameter("item");
			var sKey = oItem.getKey();
			
			if (sKey === "nrgp") {
				this.getRouter().navTo("GatePassCreation", { type: "NRGP" });
			} else if (sKey === "rgp") {
				this.getRouter().navTo("GatePassCreation", { type: "RGP" });
			} else if (sKey === "home") {
				this.getRouter().navTo("home");
			} else {
				this.getRouter().navTo(sKey);
			}
		}

	});
});
