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
			console.log("User is",sFullName)
            
			

	       
			this.byId("idWelcomeText").setText("Welcome, " + sFullName);
			this.byId("idUserAvatar").setInitials(sInitials);
			
			



		},
		

		onButtonLogoutPress: function () {
			window.location.href = "/sap/public/bc/icf/logoff";
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
